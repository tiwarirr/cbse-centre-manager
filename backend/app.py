import os

from flask import Flask
from flask_migrate import Migrate
from werkzeug.security import generate_password_hash

from extensions import db

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
migrate = Migrate()


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_mapping(
        SECRET_KEY=os.environ.get('SECRET_KEY', 'dev-secret-change-me'),
        SQLALCHEMY_DATABASE_URI=os.environ.get(
            'DATABASE_URL', 'sqlite:///' + os.path.join(BASE_DIR, 'instance', 'cbse.sqlite3')
        ),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_SAMESITE='Lax',
        SESSION_COOKIE_HTTPONLY=True,
    )
    if test_config:
        app.config.update(test_config)

    os.makedirs(os.path.join(BASE_DIR, 'instance'), exist_ok=True)
    db.init_app(app)

    import models  # noqa: F401 — registers models with SQLAlchemy metadata before create_all/migrations run
    migrate.init_app(app, db)

    from auth import bp as auth_bp
    app.register_blueprint(auth_bp)

    from api import sessions as sessions_api
    sessions_api.register(app)

    @app.get('/api/health')
    def health():
        return {'ok': True}

    @app.cli.command('create-admin')
    def create_admin():
        """Seed (or reset the password of) the single shared login user."""
        import click
        from models import User
        username = click.prompt('Username', default='admin')
        password = click.prompt('Password', hide_input=True, confirmation_prompt=True)
        user = User.query.filter_by(username=username).first()
        if user:
            user.password_hash = generate_password_hash(password)
            click.echo(f'Updated password for existing user "{username}".')
        else:
            user = User(username=username, password_hash=generate_password_hash(password))
            db.session.add(user)
            click.echo(f'Created user "{username}".')
        db.session.commit()

    return app


if __name__ == '__main__':
    create_app().run(debug=True, port=5000)
