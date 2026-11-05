export class D1Repository {
  constructor(database) {
    if (!database) throw new Error('D1 binding DB is required');
    this.db = database;
  }

  async first(sql, ...params) {
    return this.db.prepare(sql).bind(...params).first();
  }

  async all(sql, ...params) {
    const result = await this.db.prepare(sql).bind(...params).all();
    return result.results ?? [];
  }

  statement(sql, ...params) {
    return this.db.prepare(sql).bind(...params);
  }

  async run(sql, ...params) {
    return this.statement(sql, ...params).run();
  }

  async batch(statements) {
    return this.db.batch(statements);
  }

  async guardedBatch(statements, failureStatus, failureMessage, guardAfter = 0) {
    try {
      const guarded = [...statements];
      guarded.splice(guardAfter + 1, 0, this.statement('INSERT INTO mutation_guards(value) VALUES(changes())'));
      return await this.batch([
        ...guarded,
        this.statement('DELETE FROM mutation_guards'),
      ]);
    } catch (cause) {
      if (/CHECK constraint failed(?:: mutation_guards\.value|: value = 1)?/i.test(String(cause?.message))) {
        const error = new Error(failureMessage);
        error.status = failureStatus;
        error.expose = true;
        throw error;
      }
      throw cause;
    }
  }

  findActiveSession(tokenHash, now) {
    return this.first(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.expires_at>?`, tokenHash, now);
  }

  findUserByLineId(lineId) {
    return this.first('SELECT * FROM users WHERE line_id=?', lineId);
  }

  async createSession(userId, tokenHash, expiresAt) {
    await this.run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', tokenHash, userId, expiresAt);
  }

  async deleteSession(tokenHash) {
    const result = await this.run('DELETE FROM sessions WHERE token_hash=?', tokenHash);
    return result.meta.changes;
  }

  findAdminCredential(digests) {
    if (!digests.length) return null;
    const placeholders = digests.map(() => '?').join(',');
    return this.first(`SELECT u.*,c.key_version,c.code_digest,p.algorithm,p.salt,p.password_hash,p.parameters_json
      FROM users u JOIN agency_credentials c ON c.user_id=u.id
      JOIN admin_password_credentials p ON p.user_id=u.id
      WHERE c.code_digest IN (${placeholders})`, ...digests);
  }

  async createAdminLoginSession(user, primaryDigest, sessionHash, expiresAt) {
    await this.batch([
      this.statement('UPDATE agency_credentials SET key_version=?,code_digest=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?', primaryDigest.version, primaryDigest.digest, user.id),
      this.statement("INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id) VALUES(?,'admin.password_login','user',?)", user.id, String(user.id)),
      this.statement('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', sessionHash, user.id, expiresAt),
    ]);
  }

  async consumeAuthAttempt(scope, keyHash, now, windowMs, limit) {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const row = await this.first(`INSERT INTO auth_rate_limits(scope,key_hash,window_start,attempts,updated_at)
      VALUES(?,?,?,1,?)
      ON CONFLICT(scope,key_hash,window_start) DO UPDATE SET attempts=attempts+1,updated_at=excluded.updated_at
      RETURNING attempts`, scope, keyHash, windowStart, now);
    const cleanupSlot = Number.parseInt(keyHash.slice(0, 2), 16) % 64;
    if (Math.floor(now / windowMs) % 64 === cleanupSlot) {
      await this.run(`DELETE FROM auth_rate_limits WHERE rowid IN (
        SELECT rowid FROM auth_rate_limits WHERE updated_at<? ORDER BY updated_at LIMIT 100
      )`, now - Math.max(86_400_000, windowMs * 2));
    }
    return row.attempts <= limit;
  }

  findPlot(id) {
    return this.first('SELECT * FROM plots WHERE id=?', id);
  }

  hasActiveAssignment(icsUserId, farmerUserId) {
    return this.first('SELECT 1 ok FROM farmer_assignments WHERE ics_user_id=? AND farmer_user_id=? AND ends_at IS NULL', icsUserId, farmerUserId);
  }

  async createPlot(ownerId, name, crop, area) {
    const result = await this.run('INSERT INTO plots(owner_id,name,crop,area) VALUES(?,?,?,?)', ownerId, name, crop, area);
    return result.meta.last_row_id;
  }

  async updatePlot(id, ownerId, fields) {
    const updates = Object.keys(fields).map(key => `${key}=?`);
    await this.run(`UPDATE plots SET ${updates.join(',')} WHERE id=? AND owner_id=?`, ...Object.values(fields), id, ownerId);
    return this.findPlot(id);
  }

  async createActivity(plotId, userId, kind, details, activityDate, photoUrl) {
    const result = await this.run('INSERT INTO activities(plot_id,user_id,kind,details,activity_date,photo_url) VALUES(?,?,?,?,?,?)', plotId, userId, kind, details, activityDate, photoUrl);
    return result.meta.last_row_id;
  }

  async createApproval(plotId, userId, inputName, details) {
    const result = await this.run('INSERT INTO approvals(plot_id,user_id,input_name,details) VALUES(?,?,?,?)', plotId, userId, inputName, details);
    return result.meta.last_row_id;
  }

  findApproval(id) {
    return this.first('SELECT * FROM approvals WHERE id=?', id);
  }

  async reviewApproval(id, reviewerId, status, comment) {
    const result = await this.run("UPDATE approvals SET status=?,comment=?,reviewer_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", status, comment, reviewerId, id);
    return result.meta.changes;
  }

  async createLot(plotId, code, crop, harvestDate, quantity) {
    const result = await this.run('INSERT INTO lots(plot_id,code,crop,harvest_date,quantity) VALUES(?,?,?,?,?)', plotId, code, crop, harvestDate, quantity);
    return result.meta.last_row_id;
  }

  async createReview(plotId, reviewerId, resultText, note) {
    const result = await this.run('INSERT INTO reviews(plot_id,reviewer_id,result,note) VALUES(?,?,?,?)', plotId, reviewerId, resultText, note);
    return result.meta.last_row_id;
  }

  async createAdminManagedUser(actorId, name, role, credential) {
    const statements = [
      this.statement("INSERT INTO users(line_id,name,role,status) VALUES(NULL,?,?,'unlinked')", name, role),
      this.statement('INSERT INTO agency_credentials(user_id,key_version,code_digest,code_hint) VALUES(last_insert_rowid(),?,?,?)', credential.version, credential.digest, credential.hint),
      this.statement(`INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json)
        SELECT ?,'user.created','user',CAST(user_id AS TEXT),? FROM agency_credentials WHERE code_digest=?`, actorId, JSON.stringify({ role }), credential.digest),
    ];
    const results = await this.batch(statements);
    return results[0].meta.last_row_id;
  }

  findManagedUser(id) {
    return this.first("SELECT * FROM users WHERE id=? AND role IN ('farmer','ics')", id);
  }

  async updateManagedUserStatus(actorId, target, status) {
    await this.guardedBatch([
      this.statement("UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role IN ('farmer','ics')", status, target.id),
      this.statement("DELETE FROM sessions WHERE user_id=? AND ?='disabled'", target.id, status),
      this.statement("INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json) VALUES(?,'user.status_changed','user',?,?)", actorId, String(target.id), JSON.stringify({ from: target.status, to: status })),
    ], 404, 'ไม่พบบัญชีที่จัดการได้');
  }

  async createAssignment(actorId, icsUserId, farmerUserId) {
    const results = await this.batch([
      this.statement('UPDATE farmer_assignments SET ends_at=CURRENT_TIMESTAMP WHERE farmer_user_id=? AND ends_at IS NULL', farmerUserId),
      this.statement('INSERT INTO farmer_assignments(ics_user_id,farmer_user_id,assigned_by) VALUES(?,?,?)', icsUserId, farmerUserId, actorId),
      this.statement(`INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json)
        SELECT ?,'assignment.created','farmer_assignment',CAST(id AS TEXT),? FROM farmer_assignments
        WHERE farmer_user_id=? AND ends_at IS NULL`, actorId, JSON.stringify({ icsUserId, farmerUserId }), farmerUserId),
    ]);
    return results[1].meta.last_row_id;
  }

  async endAssignment(actorId, id) {
    await this.guardedBatch([
      this.statement('UPDATE farmer_assignments SET ends_at=CURRENT_TIMESTAMP WHERE id=? AND ends_at IS NULL', id),
      this.statement("INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id) VALUES(?,'assignment.ended','farmer_assignment',?)", actorId, String(id)),
    ], 404, 'ไม่พบ assignment ที่ active');
  }

  findInvitationTarget(id) {
    return this.first('SELECT u.*,c.code_hint FROM users u JOIN agency_credentials c ON c.user_id=u.id WHERE u.id=?', id);
  }

  async createInvitation(actorId, targetUserId, tokenHash, now, expiresAt) {
    const results = await this.guardedBatch([
      this.statement('UPDATE registration_invites SET revoked_at=? WHERE user_id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?', now, targetUserId, now),
      this.statement(`INSERT INTO registration_invites(user_id,token_hash,created_by,expires_at)
        SELECT id,?,?,? FROM users WHERE id=? AND role IN ('farmer','ics') AND status='unlinked' AND line_id IS NULL`, tokenHash, actorId, expiresAt, targetUserId),
      this.statement(`INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json)
        SELECT ?,'invitation.created','registration_invite',CAST(id AS TEXT),?
        FROM registration_invites WHERE token_hash=?`, actorId, JSON.stringify({ targetUserId, expiresAt }), tokenHash),
    ], 409, 'บัญชีเป้าหมายไม่พร้อมรับคำเชิญ', 1);
    return results[1].meta.last_row_id;
  }

  async redeemInvitation({ lineId, digests, tokenHash, now, sessionHash, sessionExpiresAt }) {
    if (!digests.length) return null;
    const placeholders = digests.map(() => '?').join(',');
    const primary = digests[0];
    const guard = () => this.statement('INSERT INTO mutation_guards(value) VALUES(changes())');
    try {
      await this.batch([
        this.statement(`UPDATE users SET line_id=?,status='active',linked_at=?,updated_at=?
          WHERE id=(
            SELECT c.user_id FROM agency_credentials c
            JOIN registration_invites i ON i.user_id=c.user_id
            WHERE c.code_digest IN (${placeholders}) AND i.token_hash=?
              AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>?
            LIMIT 1
          )
          AND role IN ('farmer','ics') AND status='unlinked' AND line_id IS NULL
          AND NOT EXISTS(SELECT 1 FROM users WHERE line_id=?)`,
          lineId, now, now, ...digests.map(item => item.digest), tokenHash, now, lineId),
        guard(),
        this.statement(`UPDATE registration_invites SET used_at=?,used_by_line_id=?
          WHERE token_hash=? AND user_id=(SELECT id FROM users WHERE line_id=?)
            AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?`, now, lineId, tokenHash, lineId, now),
        guard(),
        this.statement(`UPDATE agency_credentials SET key_version=?,code_digest=?,claimed_at=COALESCE(claimed_at,?),updated_at=?
          WHERE user_id=(SELECT id FROM users WHERE line_id=?) AND code_digest IN (${placeholders})`,
          primary.version, primary.digest, now, now, lineId, ...digests.map(item => item.digest)),
        guard(),
        this.statement(`INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json)
          SELECT u.id,'account.linked','user',CAST(u.id AS TEXT),json_object('invitationId',i.id)
          FROM users u JOIN registration_invites i ON i.user_id=u.id
          WHERE u.line_id=? AND i.token_hash=? AND i.used_at=?`, lineId, tokenHash, now),
        guard(),
        this.statement(`INSERT INTO sessions(token_hash,user_id,expires_at)
          SELECT ?,id,? FROM users WHERE line_id=? AND status='active'`, sessionHash, sessionExpiresAt, lineId),
        guard(),
        this.statement('DELETE FROM mutation_guards'),
      ]);
    } catch (cause) {
      const error = new Error('ข้อมูลลงทะเบียนหรือคำเชิญไม่ถูกต้อง');
      error.status = 400;
      error.expose = true;
      error.cause = cause;
      throw error;
    }
    return this.first('SELECT * FROM users WHERE line_id=?', lineId);
  }

  async revokeInvitation(actorId, inviteId, now) {
    await this.guardedBatch([
      this.statement('UPDATE registration_invites SET revoked_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?', now, inviteId, now),
      this.statement("INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id) VALUES(?,'invitation.revoked','registration_invite',?)", actorId, String(inviteId)),
    ], 409, 'คำเชิญไม่ active หรือไม่พบ');
  }

  listAdminUsers() {
    return this.all(`SELECT u.id,u.name,u.role,u.status,u.line_id IS NOT NULL linked,c.code_hint agency_code,u.created_at,u.updated_at
      FROM users u LEFT JOIN agency_credentials c ON c.user_id=u.id ORDER BY u.id`);
  }

  listAssignments() {
    return this.all(`SELECT fa.*,i.name ics_name,f.name farmer_name
      FROM farmer_assignments fa JOIN users i ON i.id=fa.ics_user_id JOIN users f ON f.id=fa.farmer_user_id ORDER BY fa.id DESC`);
  }

  listInvites(now) {
    return this.all(`SELECT i.id,i.user_id target_user_id,u.name target_name,u.role target_role,u.status target_user_status,c.code_hint target_code,
      CASE WHEN i.used_at IS NOT NULL THEN 'used' WHEN i.revoked_at IS NOT NULL THEN 'revoked'
           WHEN i.expires_at<=? THEN 'expired' ELSE 'active' END status,
      i.created_at,i.expires_at,i.used_at,i.revoked_at
      FROM registration_invites i JOIN users u ON u.id=i.user_id
      LEFT JOIN agency_credentials c ON c.user_id=u.id ORDER BY i.id DESC LIMIT 200`, now);
  }

  listUnlinkedFarmers() {
    return this.all(`SELECT u.id,u.name,c.code_hint agency_code
      FROM users u JOIN agency_credentials c ON c.user_id=u.id
      WHERE u.role='farmer' AND u.status='unlinked' AND u.line_id IS NULL ORDER BY c.code_hint`);
  }

  listUnlinkedUsers() {
    return this.all(`SELECT u.id,u.name,u.role,u.status,c.code_hint agency_code
      FROM users u JOIN agency_credentials c ON c.user_id=u.id
      WHERE u.role IN ('farmer','ics') AND u.status='unlinked' AND u.line_id IS NULL
      ORDER BY u.role,c.code_hint`);
  }

  listPlots(user) {
    if (user.role === 'admin') return this.all('SELECT p.*,u.name owner FROM plots p JOIN users u ON u.id=p.owner_id ORDER BY p.id DESC');
    if (user.role === 'ics') return this.all(`SELECT p.*,u.name owner FROM plots p JOIN users u ON u.id=p.owner_id
      JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY p.id DESC`, user.id);
    return this.all('SELECT * FROM plots WHERE owner_id=? ORDER BY id DESC', user.id);
  }

  listActivities(user) {
    const base = 'SELECT a.*,p.name plot_name,u.name farmer FROM activities a JOIN plots p ON p.id=a.plot_id JOIN users u ON u.id=a.user_id';
    if (user.role === 'admin') return this.all(`${base} ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`);
    if (user.role === 'ics') return this.all(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`, user.id);
    return this.all(`${base} WHERE p.owner_id=? ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`, user.id);
  }

  listApprovals(user) {
    const base = 'SELECT a.*,p.name plot_name,u.name farmer FROM approvals a JOIN plots p ON p.id=a.plot_id JOIN users u ON u.id=a.user_id';
    if (user.role === 'admin') return this.all(`${base} ORDER BY a.id DESC`);
    if (user.role === 'ics') return this.all(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY a.id DESC`, user.id);
    return this.all('SELECT a.*,p.name plot_name FROM approvals a JOIN plots p ON p.id=a.plot_id WHERE a.user_id=? ORDER BY a.id DESC', user.id);
  }

  listLots(user) {
    const base = 'SELECT l.*,p.name plot_name,u.name farmer FROM lots l JOIN plots p ON p.id=l.plot_id JOIN users u ON u.id=p.owner_id';
    if (user.role === 'admin') return this.all(`${base} ORDER BY l.id DESC`);
    if (user.role === 'ics') return this.all(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY l.id DESC`, user.id);
    return this.all('SELECT l.*,p.name plot_name FROM lots l JOIN plots p ON p.id=l.plot_id WHERE p.owner_id=? ORDER BY l.id DESC', user.id);
  }

  async listRisks(userId) {
    const pending = await this.all(`SELECT a.id,a.input_name,p.name plot_name,'pending' type FROM approvals a JOIN plots p ON p.id=a.plot_id
      JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL WHERE a.status='pending'`, userId);
    const inactive = await this.all(`SELECT p.id,p.name plot_name,'inactive' type FROM plots p
      JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL
      WHERE NOT EXISTS (SELECT 1 FROM activities a WHERE a.plot_id=p.id AND a.activity_date>=date('now','-14 days'))`, userId);
    return [...pending, ...inactive];
  }

  listReviews(userId) {
    return this.all(`SELECT r.*,p.name plot_name FROM reviews r JOIN plots p ON p.id=r.plot_id
      JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY r.id DESC`, userId);
  }
}
