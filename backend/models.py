from datetime import datetime, timezone

from extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)


class Session(db.Model):
    __tablename__ = 'sessions'
    id = db.Column(db.Integer, primary_key=True)
    centre_code = db.Column(db.String(20), unique=True, nullable=False)
    centre_name = db.Column(db.String(255))
    centre_head = db.Column(db.String(255))
    centre_city = db.Column(db.String(255))

    exam_year = db.Column(db.Integer)
    exam_name_x = db.Column(db.String(120))
    exam_name_xii = db.Column(db.String(120))
    exam_fullname_x = db.Column(db.String(255))
    exam_fullname_xii = db.Column(db.String(255))

    paper_size = db.Column(db.String(20))
    colour_theme = db.Column(db.String(20))
    include_citation = db.Column(db.Boolean, default=True)

    rows = db.Column(db.Integer)
    cols = db.Column(db.Integer)
    class_order = db.Column(db.String(20))
    split = db.Column(db.String(20))
    sep_plan = db.Column(db.Boolean, default=False)
    show_vacant = db.Column(db.Boolean, default=False)
    incl_private = db.Column(db.Boolean, default=False)
    seat_dir = db.Column(db.String(20))
    stagger = db.Column(db.Boolean, default=False)

    # Explicit-vs-unset semantics matter here: NULL means "never customised, use
    # the built-in constants"; {} means "explicitly cleared" (see the frontend's
    # getActiveDatesheet/getActiveCodes). Preserve that distinction as-is.
    x_datesheet = db.Column(db.JSON)
    xii_datesheet = db.Column(db.JSON)
    x_codes = db.Column(db.JSON)
    xii_codes = db.Column(db.JSON)

    inv_req = db.Column(db.JSON, default=dict)
    qp_log = db.Column(db.JSON, default=dict)

    # Answer-book ID counters — stored explicitly (rather than recomputed as
    # max(id)+1) so a deleted type/receipt/exception/audit row never gets its
    # ID reissued, matching the frontend's persisted-counter behavior.
    ab_next_type_id = db.Column(db.Integer, default=1)
    ab_next_receipt_id = db.Column(db.Integer, default=1)
    ab_next_exception_id = db.Column(db.Integer, default=1)
    ab_next_audit_id = db.Column(db.Integer, default=1)

    saved_at = db.Column(db.BigInteger)  # epoch millis, matches the frontend's Date.now()
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    candidates = db.relationship('Candidate', backref='session', cascade='all, delete-orphan')
    date_states = db.relationship('DateState', backref='session', cascade='all, delete-orphan')
    ab_types = db.relationship('AbType', backref='session', cascade='all, delete-orphan')
    ab_subject_type_map = db.relationship('AbSubjectTypeMap', backref='session', cascade='all, delete-orphan')
    ab_supp_class_type_map = db.relationship('AbSuppClassTypeMap', backref='session', cascade='all, delete-orphan')
    ab_receipts = db.relationship('AbReceipt', backref='session', cascade='all, delete-orphan')
    ab_receipt_exceptions = db.relationship('AbReceiptException', backref='session', cascade='all, delete-orphan')
    ab_audit_log = db.relationship('AbAuditLog', backref='session', cascade='all, delete-orphan')


class Candidate(db.Model):
    __tablename__ = 'candidates'
    __table_args__ = (db.UniqueConstraint('session_id', 'roll', name='uq_candidate_session_roll'),)
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    roll = db.Column(db.String(20), nullable=False)
    klass = db.Column('class', db.String(5), nullable=False)  # 'X' | 'XII' — `class` is a Python keyword
    name = db.Column(db.String(255))
    mother = db.Column(db.String(255))
    father = db.Column(db.String(255))
    sex = db.Column(db.String(10))
    cat = db.Column(db.String(20))
    school_code = db.Column(db.String(20))
    school_name = db.Column(db.String(255))

    subjects = db.relationship('CandidateSubject', backref='candidate', cascade='all, delete-orphan')


class CandidateSubject(db.Model):
    __tablename__ = 'candidate_subjects'
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey('candidates.id'), nullable=False)
    exam_date = db.Column(db.String(20), nullable=False)  # 'DD-Mon-YYYY', matches the frontend's date-string keys
    subject_code = db.Column(db.String(10), nullable=False)
    subject_name = db.Column(db.String(120))


class DateState(db.Model):
    __tablename__ = 'date_states'
    __table_args__ = (db.UniqueConstraint('session_id', 'exam_date', name='uq_datestate_session_date'),)
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    exam_date = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(10), default='empty')  # 'empty' | 'draft' | 'locked'
    split = db.Column(db.String(20))
    class_order = db.Column(db.String(20))
    subject_order = db.Column(db.JSON)
    locked_at = db.Column(db.BigInteger)
    generated_at = db.Column(db.BigInteger)
    remarks = db.Column(db.Text)

    seating_assignments = db.relationship('SeatingAssignment', backref='date_state', cascade='all, delete-orphan')
    attendance = db.relationship('Attendance', backref='date_state', cascade='all, delete-orphan')
    ab_assignments = db.relationship('AbAssignment', backref='date_state', cascade='all, delete-orphan')
    ab_damaged_serials = db.relationship('AbDamagedSerial', backref='date_state', cascade='all, delete-orphan')
    ab_supp_assignments = db.relationship('AbSuppAssignment', backref='date_state', cascade='all, delete-orphan')
    ab_supp_damaged_serials = db.relationship('AbSuppDamagedSerial', backref='date_state', cascade='all, delete-orphan')


class Attendance(db.Model):
    __tablename__ = 'attendance'
    __table_args__ = (db.UniqueConstraint('date_state_id', 'candidate_id', name='uq_attendance_datestate_candidate'),)
    id = db.Column(db.Integer, primary_key=True)
    date_state_id = db.Column(db.Integer, db.ForeignKey('date_states.id'), nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey('candidates.id'), nullable=False)
    status = db.Column(db.String(1))  # 'P' | 'A' | NULL
    marked_at = db.Column(db.BigInteger)

    candidate = db.relationship('Candidate')


class SeatingAssignment(db.Model):
    __tablename__ = 'seating_assignments'
    __table_args__ = (db.UniqueConstraint('date_state_id', 'candidate_id', name='uq_seating_datestate_candidate'),)
    id = db.Column(db.Integer, primary_key=True)
    date_state_id = db.Column(db.Integer, db.ForeignKey('date_states.id'), nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey('candidates.id'), nullable=False)
    room_no = db.Column(db.Integer)
    seat_in_room = db.Column(db.Integer)
    row = db.Column(db.Integer)
    col = db.Column(db.Integer)
    seat_label = db.Column(db.String(20))

    candidate = db.relationship('Candidate')


class AbType(db.Model):
    __tablename__ = 'ab_types'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    name = db.Column(db.String(120))
    short_code = db.Column(db.String(20))
    active = db.Column(db.Boolean, default=True)


class AbSubjectTypeMap(db.Model):
    __tablename__ = 'ab_subject_type_map'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    klass = db.Column('class', db.String(5), nullable=False)
    subject_code = db.Column(db.String(10), nullable=False)
    type_id = db.Column(db.Integer, db.ForeignKey('ab_types.id'), nullable=False)


class AbSuppClassTypeMap(db.Model):
    __tablename__ = 'ab_supp_class_type_map'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    klass = db.Column('class', db.String(5), nullable=False)
    type_id = db.Column(db.Integer, db.ForeignKey('ab_types.id'), nullable=False)


class AbReceipt(db.Model):
    __tablename__ = 'ab_receipts'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    exam_date = db.Column(db.String(20))
    type_id = db.Column(db.Integer, db.ForeignKey('ab_types.id'), nullable=False)
    start_serial = db.Column(db.String(40), nullable=False)
    end_serial = db.Column(db.String(40), nullable=False)
    challan_no = db.Column(db.String(60))
    challan_qty = db.Column(db.Integer)
    created_at = db.Column(db.BigInteger)

    exceptions = db.relationship('AbReceiptException', backref='receipt', cascade='all, delete-orphan')


class AbReceiptException(db.Model):
    __tablename__ = 'ab_receipt_exceptions'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    receipt_id = db.Column(db.Integer, db.ForeignKey('ab_receipts.id'), nullable=False)
    type_id = db.Column(db.Integer, db.ForeignKey('ab_types.id'), nullable=False)
    serial_raw = db.Column(db.String(40), nullable=False)
    kind = db.Column(db.String(30))  # 'MISSING_ON_RECEIPT' | 'DAMAGED_ON_RECEIPT'
    created_at = db.Column(db.BigInteger)


class AbAssignment(db.Model):
    __tablename__ = 'ab_assignments'
    id = db.Column(db.Integer, primary_key=True)
    date_state_id = db.Column(db.Integer, db.ForeignKey('date_states.id'), nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey('candidates.id'), nullable=False)
    type_id = db.Column(db.Integer, db.ForeignKey('ab_types.id'), nullable=False)
    serial_raw = db.Column(db.String(40), nullable=False)
    assigned_at = db.Column(db.BigInteger)

    candidate = db.relationship('Candidate')


class AbDamagedSerial(db.Model):
    __tablename__ = 'ab_damaged_serials'
    id = db.Column(db.Integer, primary_key=True)
    date_state_id = db.Column(db.Integer, db.ForeignKey('date_states.id'), nullable=False)
    serial_raw = db.Column(db.String(40), nullable=False)
    type_id = db.Column(db.Integer, db.ForeignKey('ab_types.id'), nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey('candidates.id'), nullable=True)
    damaged_at = db.Column(db.BigInteger)
    source = db.Column(db.String(30))  # e.g. 'POST_ASSIGN'

    candidate = db.relationship('Candidate')


class AbSuppAssignment(db.Model):
    __tablename__ = 'ab_supp_assignments'
    id = db.Column(db.Integer, primary_key=True)
    date_state_id = db.Column(db.Integer, db.ForeignKey('date_states.id'), nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey('candidates.id'), nullable=False)
    serial_raw = db.Column(db.String(40), nullable=False)
    type_id = db.Column(db.Integer, db.ForeignKey('ab_types.id'), nullable=False)
    issued_at = db.Column(db.BigInteger)
    note = db.Column(db.Text)

    candidate = db.relationship('Candidate')


class AbSuppDamagedSerial(db.Model):
    __tablename__ = 'ab_supp_damaged_serials'
    id = db.Column(db.Integer, primary_key=True)
    date_state_id = db.Column(db.Integer, db.ForeignKey('date_states.id'), nullable=False)
    serial_raw = db.Column(db.String(40), nullable=False)
    type_id = db.Column(db.Integer, db.ForeignKey('ab_types.id'), nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey('candidates.id'), nullable=False)
    damaged_at = db.Column(db.BigInteger)
    source = db.Column(db.String(30))  # e.g. 'SUPP_POST_ISSUE'

    candidate = db.relationship('Candidate')


class AbAuditLog(db.Model):
    __tablename__ = 'ab_audit_log'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.Integer, db.ForeignKey('sessions.id'), nullable=False)
    at = db.Column(db.BigInteger)
    action = db.Column(db.String(60))
    detail = db.Column(db.Text)
    reason = db.Column(db.Text)
