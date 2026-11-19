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

  findActivity(id) {
    return this.first('SELECT * FROM activities WHERE id=?', id);
  }

  findReview(id) {
    return this.first('SELECT * FROM reviews WHERE id=?', id);
  }

  findPhotoEvidence(id) {
    return this.first('SELECT * FROM photo_evidence WHERE id=?', id);
  }

  async createPhotoEvidence({ ownerUserId, uploadedBy, plotId, entityType, entityId = null, objectKey, contentType, sizeBytes, sha256Hex, storageBackend = 'r2' }) {
    const results = await this.batch([
      this.statement(
        `INSERT INTO photo_evidence(owner_user_id,uploaded_by,plot_id,entity_type,entity_id,object_key,content_type,size_bytes,sha256_hex,storage_backend)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
        ownerUserId, uploadedBy, plotId, entityType, entityId, objectKey, contentType, sizeBytes, sha256Hex, storageBackend
      ),
      this.statement(
        `INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json)
         VALUES(?,'evidence.uploaded','evidence',CAST(last_insert_rowid() AS TEXT),?)`,
        uploadedBy, JSON.stringify({ plotId, entityType, entityId, contentType, sizeBytes })
      ),
    ]);
    return { id: results[0].meta.last_row_id };
  }

  async attachPhotoEvidence(evidenceId, uploaderId, plotId, entityType, entityId) {
    await this.guardedBatch([
      this.statement(
        'UPDATE photo_evidence SET entity_id=? WHERE id=? AND uploaded_by=? AND plot_id=? AND entity_type=? AND entity_id IS NULL',
        entityId, evidenceId, uploaderId, plotId, entityType
      ),
    ], 400, 'ไม่สามารถผูกภาพหลักฐานนี้ได้ (ไม่พบ ถูกใช้งานแล้ว หรือไม่มีสิทธิ์)');
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
    await this.guardedBatch([
      this.statement("UPDATE approvals SET status=?,comment=?,reviewer_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", status, comment, reviewerId, id),
      this.statement("INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json) VALUES(?,'approval.reviewed','approval',?,?)", reviewerId, String(id), JSON.stringify({ status })),
    ], 404, 'รายการนี้ถูกพิจารณาแล้วหรือไม่พบ');
    return 1;
  }

  async createLot(plotId, code, crop, harvestDate, quantity) {
    const result = await this.run('INSERT INTO lots(plot_id,code,crop,harvest_date,quantity) VALUES(?,?,?,?,?)', plotId, code, crop, harvestDate, quantity);
    return result.meta.last_row_id;
  }

  findActiveIcsUser(id) {
    return this.first("SELECT id,name,role,status FROM users WHERE id=? AND role='ics' AND status='active'", id);
  }

  async createReview(plotId, reviewerId, resultText, note, { standardCode = null, checklistId = null, checklistResults = null, findings = [] } = {}) {
    const reviewRes = await this.run(
      'INSERT INTO reviews(plot_id,reviewer_id,result,note) VALUES(?,?,?,?)',
      plotId, reviewerId, resultText, note
    );
    const reviewId = reviewRes.meta.last_row_id;

    const followUp = [];
    if (standardCode || checklistId || (Array.isArray(checklistResults) && checklistResults.length)) {
      followUp.push(this.statement(
        'INSERT INTO review_assessments(review_id,standard_code,checklist_id,checklist_results_json) VALUES(?,?,?,?)',
        reviewId,
        standardCode || 'PGS',
        checklistId ?? null,
        JSON.stringify(Array.isArray(checklistResults) ? checklistResults : [])
      ));
    }
    followUp.push(this.statement(
      "INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json) VALUES(?,'review.created','review',?,?)",
      reviewerId,
      String(reviewId),
      JSON.stringify({ plotId, result: resultText, ...(standardCode ? { standardCode } : {}), ...(findings.length ? { findingsCount: findings.length } : {}) })
    ));
    await this.batch(followUp);

    const correctiveActionIds = [];
    for (const item of findings) {
      const actionRes = await this.createCorrectiveAction({
        plotId,
        reviewId,
        standardCode: item.standardCode || standardCode || 'PGS',
        severity: item.severity || 'medium',
        finding: item.finding,
        actionRequired: item.actionRequired,
        responsibleUserId: item.responsibleUserId ?? reviewerId,
        dueDate: item.dueDate,
        createdBy: reviewerId,
      });
      correctiveActionIds.push(actionRes.id);
    }

    return { id: reviewId, correctiveActionIds };
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

  async listActivities(user) {
    const withEvidence = `SELECT a.*,p.name plot_name,u.name farmer,
      (SELECT pe.id FROM photo_evidence pe WHERE pe.entity_type='activity' AND pe.entity_id=a.id ORDER BY pe.id DESC LIMIT 1) evidence_id
      FROM activities a JOIN plots p ON p.id=a.plot_id JOIN users u ON u.id=a.user_id`;
    const legacyBase = 'SELECT a.*,p.name plot_name,u.name farmer FROM activities a JOIN plots p ON p.id=a.plot_id JOIN users u ON u.id=a.user_id';
    const runQuery = base => {
      if (user.role === 'admin') return this.all(`${base} ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`);
      if (user.role === 'ics') return this.all(`${base} JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`, user.id);
      return this.all(`${base} WHERE p.owner_id=? ORDER BY a.activity_date DESC,a.id DESC LIMIT 300`, user.id);
    };
    try {
      return await runQuery(withEvidence);
    } catch (err) {
      if (/no such table: photo_evidence/i.test(String(err?.message))) return runQuery(legacyBase);
      throw err;
    }
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

  parseJsonSafe(raw, fallback) {
    if (!raw || typeof raw !== 'string') return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  formatChecklist(row) {
    if (!row) return null;
    return {
      id: row.id,
      standard_code: row.standard_code,
      title: row.title,
      description: row.description || '',
      items: this.parseJsonSafe(row.items_json, []),
      validation_status: row.validation_status,
      is_active: Boolean(row.is_active),
      created_by: row.created_by ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async listChecklists({ standardCode = null, includeInactive = false } = {}) {
    const clauses = [];
    const params = [];
    if (standardCode) { clauses.push('standard_code=?'); params.push(standardCode); }
    if (!includeInactive) clauses.push('is_active=1');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.all(`SELECT * FROM inspection_checklists ${where} ORDER BY standard_code, id`, ...params);
    return rows.map(row => this.formatChecklist(row));
  }

  async findChecklist(id) {
    const row = await this.first('SELECT * FROM inspection_checklists WHERE id=?', id);
    return this.formatChecklist(row);
  }

  async createChecklist({ actorId, standardCode, title, description = '', items, validationStatus = 'draft_unvalidated' }) {
    const res = await this.run(
      'INSERT INTO inspection_checklists(standard_code,title,description,items_json,validation_status,created_by) VALUES(?,?,?,?,?,?)',
      standardCode, title, description, JSON.stringify(items), validationStatus, actorId
    );
    const id = res.meta.last_row_id;
    await this.run(
      "INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json) VALUES(?,'checklist.created','inspection_checklist',?,?)",
      actorId, String(id), JSON.stringify({ standardCode, validationStatus, itemCount: items.length })
    );
    return this.findChecklist(id);
  }

  async updateChecklist(id, actorId, updates) {
    const sets = [];
    const params = [];
    if (Object.hasOwn(updates, 'title')) { sets.push('title=?'); params.push(updates.title); }
    if (Object.hasOwn(updates, 'description')) { sets.push('description=?'); params.push(updates.description); }
    if (Object.hasOwn(updates, 'items')) { sets.push('items_json=?'); params.push(JSON.stringify(updates.items)); }
    if (Object.hasOwn(updates, 'is_active')) { sets.push('is_active=?'); params.push(updates.is_active ? 1 : 0); }
    if (Object.hasOwn(updates, 'validation_status')) { sets.push('validation_status=?'); params.push(updates.validation_status); }
    sets.push('updated_at=CURRENT_TIMESTAMP');
    await this.batch([
      this.statement(`UPDATE inspection_checklists SET ${sets.join(',')} WHERE id=?`, ...params, id),
      this.statement(
        "INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json) VALUES(?,'checklist.updated','inspection_checklist',?,?)",
        actorId, String(id), JSON.stringify({ fields: Object.keys(updates) })
      ),
    ]);
    return this.findChecklist(id);
  }

  findCorrectiveAction(id) {
    return this.first('SELECT * FROM corrective_actions WHERE id=?', id);
  }

  async findCorrectiveActionDetail(id) {
    const row = await this.first(`SELECT ca.*,p.name plot_name,u.name farmer_name,ru.name responsible_name,
      r.result review_result,
      CASE WHEN ca.status!='resolved' AND ca.due_date<date('now') THEN 1 ELSE 0 END is_overdue
      FROM corrective_actions ca
      JOIN plots p ON p.id=ca.plot_id
      JOIN users u ON u.id=p.owner_id
      JOIN users ru ON ru.id=ca.responsible_user_id
      LEFT JOIN reviews r ON r.id=ca.review_id
      WHERE ca.id=?`, id);
    return row ? { ...row, is_overdue: Boolean(row.is_overdue) } : null;
  }

  async listCorrectiveActions(user, { status = null, plotId = null, standardCode = null } = {}) {
    const clauses = [];
    const params = [];
    let assignmentJoin = '';
    if (user.role === 'ics') {
      assignmentJoin = 'JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL';
      params.push(user.id);
    }
    if (status) { clauses.push('ca.status=?'); params.push(status); }
    if (plotId) { clauses.push('ca.plot_id=?'); params.push(plotId); }
    if (standardCode) { clauses.push('ca.standard_code=?'); params.push(standardCode); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.all(`SELECT ca.*,p.name plot_name,u.name farmer_name,ru.name responsible_name,
      r.result review_result,
      CASE WHEN ca.status!='resolved' AND ca.due_date<date('now') THEN 1 ELSE 0 END is_overdue
      FROM corrective_actions ca
      JOIN plots p ON p.id=ca.plot_id
      JOIN users u ON u.id=p.owner_id
      JOIN users ru ON ru.id=ca.responsible_user_id
      LEFT JOIN reviews r ON r.id=ca.review_id
      ${assignmentJoin}
      ${where}
      ORDER BY CASE ca.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, ca.due_date ASC, ca.id DESC`, ...params);
    return rows.map(row => ({ ...row, is_overdue: Boolean(row.is_overdue) }));
  }

  async createCorrectiveAction({ plotId, reviewId = null, standardCode = 'PGS', severity = 'medium', finding, actionRequired, responsibleUserId, dueDate, createdBy }) {
    const results = await this.batch([
      this.statement(
        `INSERT INTO corrective_actions(plot_id,review_id,standard_code,severity,finding,action_required,responsible_user_id,due_date,created_by)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        plotId, reviewId, standardCode, severity, finding, actionRequired, responsibleUserId, dueDate, createdBy
      ),
      this.statement(
        "INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json) VALUES(?,'corrective_action.created','corrective_action',CAST(last_insert_rowid() AS TEXT),?)",
        createdBy, JSON.stringify({ plotId, reviewId, standardCode, severity, dueDate, responsibleUserId })
      ),
    ]);
    return this.findCorrectiveActionDetail(results[0].meta.last_row_id);
  }

  async updateCorrectiveAction(id, actorId, existing, updates) {
    const sets = [];
    const params = [];
    if (Object.hasOwn(updates, 'status')) {
      sets.push('status=?');
      params.push(updates.status);
      if (updates.status === 'resolved') sets.push('resolved_at=CURRENT_TIMESTAMP');
      else sets.push('resolved_at=NULL');
    }
    if (Object.hasOwn(updates, 'resolution_note')) { sets.push('resolution_note=?'); params.push(updates.resolution_note); }
    if (Object.hasOwn(updates, 'due_date')) { sets.push('due_date=?'); params.push(updates.due_date); }
    if (Object.hasOwn(updates, 'severity')) { sets.push('severity=?'); params.push(updates.severity); }
    if (Object.hasOwn(updates, 'responsible_user_id')) { sets.push('responsible_user_id=?'); params.push(updates.responsible_user_id); }
    if (Object.hasOwn(updates, 'finding')) { sets.push('finding=?'); params.push(updates.finding); }
    if (Object.hasOwn(updates, 'action_required')) { sets.push('action_required=?'); params.push(updates.action_required); }
    sets.push('updated_at=CURRENT_TIMESTAMP');
    const nextStatus = updates.status ?? existing.status;
    await this.batch([
      this.statement(`UPDATE corrective_actions SET ${sets.join(',')} WHERE id=?`, ...params, id),
      this.statement(
        "INSERT INTO audit_logs(actor_user_id,event_type,target_type,target_id,metadata_json) VALUES(?,'corrective_action.updated','corrective_action',?,?)",
        actorId, String(id), JSON.stringify({ plotId: existing.plot_id, fromStatus: existing.status, toStatus: nextStatus })
      ),
    ]);
    return this.findCorrectiveActionDetail(id);
  }

  async listAuditLogs(user) {
    const rows = user.role === 'admin'
      ? await this.all(`SELECT l.id,l.actor_user_id,u.name actor_name,l.event_type,l.target_type,l.target_id,l.metadata_json,l.created_at
          FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_user_id ORDER BY l.id DESC LIMIT 100`)
      : await this.all(`SELECT l.id,l.actor_user_id,u.name actor_name,l.event_type,l.target_type,l.target_id,l.metadata_json,l.created_at
          FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_user_id
          WHERE l.actor_user_id=?
            AND l.event_type IN ('review.created','approval.reviewed','corrective_action.created','corrective_action.updated','checklist.created','checklist.updated','evidence.uploaded')
          ORDER BY l.id DESC LIMIT 100`, user.id);
    return rows.map(row => ({
      id: row.id,
      actor_user_id: row.actor_user_id,
      actor_name: row.actor_name || null,
      event_type: row.event_type,
      target_type: row.target_type,
      target_id: row.target_id,
      metadata: this.parseJsonSafe(row.metadata_json, {}),
      created_at: row.created_at,
    }));
  }

  async listRisks(userId) {
    const pendingRows = await this.all(`SELECT a.id,a.plot_id,a.input_name,p.name plot_name,u.name farmer_name
      FROM approvals a JOIN plots p ON p.id=a.plot_id JOIN users u ON u.id=p.owner_id
      JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL
      WHERE a.status='pending'`, userId);
    const pending = pendingRows.map(row => ({
      ...row,
      type: 'pending',
      severity: 'medium',
      title: 'คำขอใช้ปัจจัยการผลิตรอพิจารณา',
      explanation: `คำขอ "${row.input_name}" รอเจ้าหน้าที่ ICS พิจารณาก่อนนำไปใช้ในแปลง`,
      recommended_tab: 'approval',
    }));

    const inactiveRows = await this.all(`SELECT p.id,p.id plot_id,p.name plot_name,u.name farmer_name
      FROM plots p JOIN users u ON u.id=p.owner_id
      JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL
      WHERE NOT EXISTS (SELECT 1 FROM activities a WHERE a.plot_id=p.id AND a.activity_date>=date('now','-14 days'))`, userId);
    const inactive = inactiveRows.map(row => ({
      ...row,
      type: 'inactive',
      severity: 'high',
      title: 'ขาดบันทึกกิจกรรมเกิน 14 วัน',
      explanation: 'ไม่พบบันทึกกิจกรรมการดูแลแปลงติดต่อกันเกิน 14 วัน ควรติดตามหรือลงตรวจแปลง',
      recommended_tab: 'record',
    }));

    let missingEvidence = [];
    try {
      const missingRows = await this.all(`SELECT p.id,p.id plot_id,p.name plot_name,u.name farmer_name,COUNT(*) missing_count
        FROM activities a
        JOIN plots p ON p.id=a.plot_id
        JOIN users u ON u.id=p.owner_id
        JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL
        WHERE a.activity_date>=date('now','-30 days')
          AND (a.photo_url IS NULL OR TRIM(a.photo_url)='')
          AND NOT EXISTS (SELECT 1 FROM photo_evidence pe WHERE pe.entity_type='activity' AND pe.entity_id=a.id)
        GROUP BY p.id,p.name,u.name`, userId);
      missingEvidence = missingRows.map(row => ({
        ...row,
        type: 'missing_evidence',
        severity: row.missing_count >= 3 ? 'medium' : 'low',
        title: 'กิจกรรมขาดภาพถ่ายหลักฐาน',
        explanation: `พบ ${row.missing_count} กิจกรรมในรอบ 30 วันล่าสุดที่ยังไม่มีภาพหลักฐานแนบประกอบ`,
        recommended_tab: 'record',
      }));
    } catch (err) {
      if (!/no such table: photo_evidence/i.test(String(err?.message))) throw err;
    }

    let actionRisks = [];
    try {
      const actionRows = await this.all(`SELECT ca.id,ca.plot_id,ca.standard_code,ca.severity,ca.finding,ca.due_date,ca.status,
        p.name plot_name,u.name farmer_name,ru.name responsible_name,
        CASE WHEN ca.due_date<date('now') THEN 1 ELSE 0 END is_overdue
        FROM corrective_actions ca
        JOIN plots p ON p.id=ca.plot_id
        JOIN users u ON u.id=p.owner_id
        JOIN users ru ON ru.id=ca.responsible_user_id
        JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL
        WHERE ca.status IN ('open','in_progress')`, userId);
      actionRisks = actionRows.map(row => {
        const overdue = Boolean(row.is_overdue);
        return {
          id: row.id,
          plot_id: row.plot_id,
          plot_name: row.plot_name,
          farmer_name: row.farmer_name,
          standard_code: row.standard_code,
          due_date: row.due_date,
          responsible_name: row.responsible_name,
          type: overdue ? 'overdue_action' : 'open_action',
          severity: overdue ? 'high' : (row.severity === 'high' ? 'high' : 'medium'),
          title: overdue ? 'เกินกำหนดแก้ไขปรับปรุง (CAPA)' : 'รายการแก้ไขปรับปรุงรอดำเนินการ',
          explanation: overdue
            ? `ข้อบกพร่อง "${row.finding}" เกินกำหนดวันที่ ${row.due_date} (มาตรฐาน ${row.standard_code})`
            : `ข้อบกพร่อง "${row.finding}" กำหนดแก้ไขภายในวันที่ ${row.due_date} (มาตรฐาน ${row.standard_code})`,
          recommended_tab: 'reviews',
        };
      });
    } catch (err) {
      if (!/no such table: corrective_actions/i.test(String(err?.message))) throw err;
    }

    const severityRank = { high: 0, medium: 1, low: 2 };
    return [...actionRisks, ...inactive, ...pending, ...missingEvidence]
      .sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));
  }

  async listReviews(userId) {
    const fullQuery = `SELECT r.*,p.name plot_name,u.name farmer_name,rv.name reviewer_name,
      (SELECT pe.id FROM photo_evidence pe WHERE pe.entity_type='review' AND pe.entity_id=r.id ORDER BY pe.id DESC LIMIT 1) evidence_id,
      ra.standard_code,ra.checklist_id,ra.checklist_results_json,
      (SELECT COUNT(*) FROM corrective_actions ca WHERE ca.review_id=r.id AND ca.status!='resolved') open_actions_count,
      (SELECT COUNT(*) FROM corrective_actions ca WHERE ca.review_id=r.id) total_actions_count
      FROM reviews r
      JOIN plots p ON p.id=r.plot_id
      JOIN users u ON u.id=p.owner_id
      JOIN users rv ON rv.id=r.reviewer_id
      LEFT JOIN review_assessments ra ON ra.review_id=r.id
      JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL
      ORDER BY r.id DESC`;
    const withEvidence = `SELECT r.*,p.name plot_name,u.name farmer_name,rv.name reviewer_name,
      (SELECT pe.id FROM photo_evidence pe WHERE pe.entity_type='review' AND pe.entity_id=r.id ORDER BY pe.id DESC LIMIT 1) evidence_id
      FROM reviews r JOIN plots p ON p.id=r.plot_id JOIN users u ON u.id=p.owner_id JOIN users rv ON rv.id=r.reviewer_id
      JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY r.id DESC`;
    const legacy = `SELECT r.*,p.name plot_name FROM reviews r JOIN plots p ON p.id=r.plot_id
      JOIN farmer_assignments fa ON fa.farmer_user_id=p.owner_id AND fa.ics_user_id=? AND fa.ends_at IS NULL ORDER BY r.id DESC`;
    try {
      const rows = await this.all(fullQuery, userId);
      return rows.map(row => ({
        ...row,
        checklist_results: this.parseJsonSafe(row.checklist_results_json, []),
      }));
    } catch (err) {
      if (/no such table: (?:review_assessments|corrective_actions)/i.test(String(err?.message))) {
        try { return await this.all(withEvidence, userId); }
        catch (innerErr) {
          if (/no such table: photo_evidence/i.test(String(innerErr?.message))) return this.all(legacy, userId);
          throw innerErr;
        }
      }
      if (/no such table: photo_evidence/i.test(String(err?.message))) return this.all(legacy, userId);
      throw err;
    }
  }
}
