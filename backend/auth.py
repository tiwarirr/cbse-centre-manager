from functools import wraps

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash

from extensions import db
from models import User

bp = Blueprint('auth', __name__, url_prefix='/api/auth')


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get('user_id'):
            return jsonify({'error': 'Not authenticated'}), 401
        return fn(*args, **kwargs)
    return wrapper


@bp.post('/login')
def login():
    data = request.get_json(silent=True) or {}
    password = data.get('password', '')
    # Single shared login for this single-centre app — see AGENTS.md / plan.
    user = User.query.first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid password'}), 401
    session['user_id'] = user.id
    session.permanent = True
    return jsonify({'ok': True, 'username': user.username})


@bp.post('/logout')
def logout():
    session.pop('user_id', None)
    return jsonify({'ok': True})


@bp.get('/status')
def status():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'loggedIn': False})
    user = db.session.get(User, user_id)
    return jsonify({'loggedIn': bool(user), 'username': user.username if user else None})
