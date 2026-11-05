CREATE TABLE mutation_guards(
  value INTEGER NOT NULL CHECK(value = 1)
);

CREATE INDEX plots_owner_id ON plots(owner_id);
CREATE INDEX activities_plot_date ON activities(plot_id,activity_date);
CREATE INDEX activities_user_id ON activities(user_id);
CREATE INDEX approvals_plot_status ON approvals(plot_id,status);
CREATE INDEX approvals_user_id ON approvals(user_id);
CREATE INDEX lots_plot_id ON lots(plot_id);
CREATE INDEX reviews_plot_id ON reviews(plot_id);
CREATE INDEX reviews_reviewer_id ON reviews(reviewer_id);
CREATE INDEX sessions_user_id ON sessions(user_id);
CREATE INDEX sessions_expires_at ON sessions(expires_at);
CREATE INDEX users_role_status ON users(role,status);
