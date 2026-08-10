"""PythonAnywhere WSGI entry point.

On PythonAnywhere, point the "Web" tab's WSGI configuration file at this
module (or copy its contents in) after adding this project's `backend/`
directory to `sys.path`. See AGENTS.md / the deployment plan for the full
PythonAnywhere setup steps (virtualenv, static file mapping, `flask db
upgrade`, `flask create-admin`).
"""
from app import create_app

application = create_app()

if __name__ == '__main__':
    application.run()
