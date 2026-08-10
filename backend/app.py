import os

from flask import Flask, send_from_directory
from flask_cors import CORS
from flask_migrate import Migrate
from werkzeug.security import generate_password_hash

from extensions import db

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), 'frontend')
migrate = Migrate()


def create_app(test_config=None):
    # Serving frontend/ directly from Flask (recommended, and how PythonAnywhere
    # deployment works — see AGENTS.md) means the browser sees ONE origin, so
    # session cookies just work with default same-site settings. CORS below is
    # only needed for the alternative dev setup of running the frontend via a
    # separate `python -m http.server` on another port.
    app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
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

    cors_origins = os.environ.get('CORS_ORIGINS', 'http://localhost:8765,http://127.0.0.1:8765').split(',')
    CORS(app, supports_credentials=True, origins=cors_origins, resources={r'/api/*': {'origins': cors_origins}})

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

    @app.get('/')
    def index():
        return send_from_directory(FRONTEND_DIR, 'index.html')

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
