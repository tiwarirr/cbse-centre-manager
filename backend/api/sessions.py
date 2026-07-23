import time

from flask import Blueprint, jsonify, request

from extensions import db
from models import (
    AbAssignment, AbAuditLog, AbDamagedSerial, AbReceipt, AbReceiptException,
    AbSubjectTypeMap, AbSuppAssignment, AbSuppClassTypeMap, AbSuppDamagedSerial,
    AbType, Attendance, Candidate, CandidateSubject, DateState, SeatingAssignment,
    Session,
)

bp = Blueprint('sessions', __name__, url_prefix='/api/sessions')


# ---------------------------------------------------------------- GET (list)
@bp.get('')
def list_sessions():
    rows = Session.query.order_by(Session.saved_at.desc()).all()
    return jsonify([
        {
            'centreCode': s.centre_code,
            'centreName': s.centre_name,
            'savedAt': s.saved_at,
            'candidates': len(s.candidates),
        }
        for s in rows
    ])


# ---------------------------------------------------------------- GET (one)
@bp.get('/<centre_code>')
def get_session(centre_code):
    sess = Session.query.filter_by(centre_code=centre_code).first()
    if not sess:
        return jsonify({'error': 'Session not found'}), 404
    return jsonify(session_to_payload(sess))


def _primary_subject(candidate, exam_date):
    """Mirrors the frontend's getPrimarySubject(candidate, ds) — the answer-book
    ledger stores subjectCode/subjectName redundantly (not just a subject FK),
    matching how abSetAssignment() builds it client-side, so the API reconstructs
    the same shape here rather than requiring the frontend to re-derive it."""
    if not candidate:
        return None, None
    for sub in candidate.subjects:
        if sub.exam_date == exam_date:
            return sub.subject_code, sub.subject_name
    return None, None


def session_to_payload(sess: Session) -> dict:
    # ---- candidates + dateSubjects ----
    candidates = []
    for c in sess.candidates:
        date_subjects = {}
        for sub in c.subjects:
            date_subjects.setdefault(sub.exam_date, []).append(
                {'code': sub.subject_code, 'name': sub.subject_name}
            )
        candidates.append({
            'roll': c.roll, 'class': c.klass, 'name': c.name, 'mother': c.mother,
            'father': c.father, 'sex': c.sex, 'cat': c.cat,
            'schoolCode': c.school_code, 'schoolName': c.school_name,
            'dateSubjects': date_subjects,
        })

    # ---- dateStates (slim seating, matching buildSlimDateStates on the frontend) ----
    date_states = {}
    for ds in sess.date_states:
        seating = []
        for sa in ds.seating_assignments:
            cand = sa.candidate  # via backref-less FK; loaded through relationship below
            seating.append({
                'roll': cand.roll, 'class': cand.klass, 'name': cand.name,
                'schoolCode': cand.school_code, 'schoolName': cand.school_name,
                'roomNo': sa.room_no, 'seatInRoom': sa.seat_in_room,
                'row': sa.row, 'col': sa.col, 'seatLabel': sa.seat_label,
            })
        attendance = {a.candidate.roll: a.status for a in ds.attendance}
        date_states[ds.exam_date] = {
            'status': ds.status, 'split': ds.split, 'classOrder': ds.class_order,
            'subjectOrder': ds.subject_order, 'lockedAt': ds.locked_at,
            'generatedAt': ds.generated_at, 'attendance': attendance, 'seating': seating,
        }

    # ---- answer book ----
    types = [{'id': t.id, 'name': t.name, 'shortCode': t.short_code, 'active': t.active} for t in sess.ab_types]
    subject_type_map = {f'{m.klass}|{m.subject_code}': m.type_id for m in sess.ab_subject_type_map}
    supp_class_type_map = {m.klass: m.type_id for m in sess.ab_supp_class_type_map}
    receipts = [{
        'id': r.id, 'date': r.exam_date, 'typeId': r.type_id, 'startSerial': r.start_serial,
        'endSerial': r.end_serial, 'challanNo': r.challan_no, 'challanQty': r.challan_qty,
        'createdAt': r.created_at,
    } for r in sess.ab_receipts]
    receipt_exceptions = [{
        'id': e.id, 'receiptId': e.receipt_id, 'typeId': e.type_id,
        'serialRaw': e.serial_raw, 'kind': e.kind, 'createdAt': e.created_at,
    } for e in sess.ab_receipt_exceptions]
    audit_log = [{'id': a.id, 'at': a.at, 'action': a.action, 'detail': a.detail, 'reason': a.reason}
                 for a in sess.ab_audit_log]

    date_ledger = {}
    for ds in sess.date_states:
        assignments = {}
        for a in ds.ab_assignments:
            sub_code, sub_name = _primary_subject(a.candidate, ds.exam_date)
            assignments[a.candidate.roll] = {
                'roll': a.candidate.roll, 'class': a.candidate.klass,
                'subjectCode': sub_code, 'subjectName': sub_name,
                'typeId': a.type_id, 'serialRaw': a.serial_raw, 'assignedAt': a.assigned_at,
            }
        damaged = [{'serialRaw': d.serial_raw, 'typeId': d.type_id,
                    'roll': d.candidate.roll if d.candidate else None,
                    'class': d.candidate.klass if d.candidate else None,
                    'damagedAt': d.damaged_at, 'source': d.source} for d in ds.ab_damaged_serials]
        supp_assignments = {}
        for sa in ds.ab_supp_assignments:
            supp_assignments.setdefault(sa.candidate.roll, []).append({
                'serialRaw': sa.serial_raw, 'typeId': sa.type_id, 'class': sa.candidate.klass,
                'issuedAt': sa.issued_at, 'note': sa.note,
            })
        supp_damaged = [{'serialRaw': d.serial_raw, 'typeId': d.type_id, 'class': d.candidate.klass,
                         'roll': d.candidate.roll, 'damagedAt': d.damaged_at, 'source': d.source}
                        for d in ds.ab_supp_damaged_serials]
        date_ledger[ds.exam_date] = {
            'assignments': assignments, 'damagedSerials': damaged,
            'suppAssignments': supp_assignments, 'suppDamagedSerials': supp_damaged,
            'suppEntryErrors': {}, 'remarks': ds.remarks or '',
        }

    answer_book = {
        'types': types, 'subjectTypeMap': subject_type_map, 'suppClassTypeMap': supp_class_type_map,
        'receipts': receipts, 'receiptExceptions': receipt_exceptions, 'dateLedger': date_ledger,
        'serialRegistry': {},  # always derived client-side, never persisted — mirrors getAnswerBookForPersistence()
        'auditLog': audit_log,
        'nextTypeId': sess.ab_next_type_id, 'nextReceiptId': sess.ab_next_receipt_id,
        'nextExceptionId': sess.ab_next_exception_id, 'nextAuditId': sess.ab_next_audit_id,
    }

    global_cfg = {
        'rows': sess.rows, 'cols': sess.cols, 'classOrder': sess.class_order, 'split': sess.split,
        'sepPlan': sess.sep_plan, 'showVacant': sess.show_vacant, 'inclPrivate': sess.incl_private,
        'seatDir': sess.seat_dir, 'stagger': sess.stagger,
        'xDatesheet': sess.x_datesheet, 'xiiDatesheet': sess.xii_datesheet,
        'xCodes': sess.x_codes, 'xiiCodes': sess.xii_codes,
        'examYear': sess.exam_year, 'examNameX': sess.exam_name_x, 'examNameXII': sess.exam_name_xii,
        'examFullNameX': sess.exam_fullname_x, 'examFullNameXII': sess.exam_fullname_xii,
    }

    return {
        'globalCfg': global_cfg,
        'invReq': sess.inv_req or {},
        'centreName': sess.centre_name, 'centreCode': sess.centre_code,
        'centreHead': sess.centre_head, 'centreCity': sess.centre_city,
        'paperSize': sess.paper_size, 'colourTheme': sess.colour_theme,
        'includeCitation': sess.include_citation,
        'candidates': candidates, 'dateStates': date_states, 'qpLog': sess.qp_log or {},
        'answerBook': answer_book, 'savedAt': sess.saved_at,
    }


# ---------------------------------------------------------------- PUT (full replace)
@bp.put('/<centre_code>')
def put_session(centre_code):
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({'error': 'JSON body required'}), 400

    sess = Session.query.filter_by(centre_code=centre_code).first()
    if not sess:
        sess = Session(centre_code=centre_code)
        db.session.add(sess)

    g = payload.get('globalCfg') or {}
    sess.centre_name = payload.get('centreName')
    sess.centre_head = payload.get('centreHead')
    sess.centre_city = payload.get('centreCity')
    sess.paper_size = payload.get('paperSize')
    sess.colour_theme = payload.get('colourTheme')
    sess.include_citation = payload.get('includeCitation', True)
    sess.rows = g.get('rows')
    sess.cols = g.get('cols')
    sess.class_order = g.get('classOrder')
    sess.split = g.get('split')
    sess.sep_plan = g.get('sepPlan', False)
    sess.show_vacant = g.get('showVacant', False)
    sess.incl_private = g.get('inclPrivate', False)
    sess.seat_dir = g.get('seatDir')
    sess.stagger = g.get('stagger', False)
    sess.x_datesheet = g.get('xDatesheet')
    sess.xii_datesheet = g.get('xiiDatesheet')
    sess.x_codes = g.get('xCodes')
    sess.xii_codes = g.get('xiiCodes')
    sess.exam_year = g.get('examYear')
    sess.exam_name_x = g.get('examNameX')
    sess.exam_name_xii = g.get('examNameXII')
    sess.exam_fullname_x = g.get('examFullNameX')
    sess.exam_fullname_xii = g.get('examFullNameXII')
    sess.inv_req = payload.get('invReq') or {}
    sess.qp_log = payload.get('qpLog') or {}
    sess.saved_at = payload.get('savedAt') or int(time.time() * 1000)

    db.session.flush()  # ensure sess.id exists for a brand-new session

    # Full replace: this mirrors the frontend's own saveToBrowser(), which already
    # overwrites the entire localStorage payload every time — no diffing needed.
    _clear_session_children(sess)
    db.session.flush()

    roll_to_candidate_id = _insert_candidates(sess, payload.get('candidates') or [])
    _insert_answer_book_types_and_maps(sess, payload.get('answerBook') or {})
    _insert_receipts(sess, payload.get('answerBook') or {})
    date_to_datestate_id = _insert_date_states(sess, payload.get('dateStates') or {}, roll_to_candidate_id)
    _insert_ledger(sess, (payload.get('answerBook') or {}).get('dateLedger') or {},
                    date_to_datestate_id, roll_to_candidate_id)
    _insert_audit_log(sess, (payload.get('answerBook') or {}).get('auditLog') or [])

    ab = payload.get('answerBook') or {}
    sess.ab_next_type_id = ab.get('nextTypeId', 1)
    sess.ab_next_receipt_id = ab.get('nextReceiptId', 1)
    sess.ab_next_exception_id = ab.get('nextExceptionId', 1)
    sess.ab_next_audit_id = ab.get('nextAuditId', 1)

    db.session.commit()
    return jsonify({'ok': True, 'savedAt': sess.saved_at})


def _clear_session_children(sess):
    # Deleting these explicitly (rather than relying only on cascade) keeps the
    # "full replace" semantics obvious and works whether or not cascade fired yet.
    for c in list(sess.candidates):
        db.session.delete(c)
    for ds in list(sess.date_states):
        db.session.delete(ds)
    for t in list(sess.ab_types):
        db.session.delete(t)
    for m in list(sess.ab_subject_type_map):
        db.session.delete(m)
    for m in list(sess.ab_supp_class_type_map):
        db.session.delete(m)
    for r in list(sess.ab_receipts):
        db.session.delete(r)
    for a in list(sess.ab_audit_log):
        db.session.delete(a)


def _insert_candidates(sess, candidates):
    roll_to_id = {}
    for c in candidates:
        cand = Candidate(
            session_id=sess.id, roll=c.get('roll'), klass=c.get('class'), name=c.get('name'),
            mother=c.get('mother'), father=c.get('father'), sex=c.get('sex'), cat=c.get('cat'),
            school_code=c.get('schoolCode'), school_name=c.get('schoolName'),
        )
        db.session.add(cand)
        db.session.flush()
        roll_to_id[c.get('roll')] = cand.id
        for ds, subs in (c.get('dateSubjects') or {}).items():
            for sub in subs:
                db.session.add(CandidateSubject(
                    candidate_id=cand.id, exam_date=ds,
                    subject_code=sub.get('code'), subject_name=sub.get('name'),
                ))
    return roll_to_id


def _insert_answer_book_types_and_maps(sess, ab):
    for t in ab.get('types') or []:
        db.session.add(AbType(id=t.get('id'), session_id=sess.id, name=t.get('name'),
                               short_code=t.get('shortCode'), active=t.get('active', True)))
    db.session.flush()
    for key, type_id in (ab.get('subjectTypeMap') or {}).items():
        klass, subject_code = key.split('|', 1)
        db.session.add(AbSubjectTypeMap(session_id=sess.id, klass=klass, subject_code=subject_code, type_id=type_id))
    for klass, type_id in (ab.get('suppClassTypeMap') or {}).items():
        if type_id:
            db.session.add(AbSuppClassTypeMap(session_id=sess.id, klass=klass, type_id=type_id))


def _insert_receipts(sess, ab):
    for r in ab.get('receipts') or []:
        db.session.add(AbReceipt(
            id=r.get('id'), session_id=sess.id, exam_date=r.get('date'), type_id=r.get('typeId'),
            start_serial=r.get('startSerial'), end_serial=r.get('endSerial'),
            challan_no=r.get('challanNo'), challan_qty=r.get('challanQty'), created_at=r.get('createdAt'),
        ))
    db.session.flush()
    for e in ab.get('receiptExceptions') or []:
        db.session.add(AbReceiptException(
            id=e.get('id'), session_id=sess.id, receipt_id=e.get('receiptId'), type_id=e.get('typeId'),
            serial_raw=e.get('serialRaw'), kind=e.get('kind'), created_at=e.get('createdAt'),
        ))


def _insert_date_states(sess, date_states, roll_to_candidate_id):
    date_to_id = {}
    for ds_key, ds in date_states.items():
        row = DateState(
            session_id=sess.id, exam_date=ds_key, status=ds.get('status', 'empty'),
            split=ds.get('split'), class_order=ds.get('classOrder'), subject_order=ds.get('subjectOrder'),
            locked_at=ds.get('lockedAt'), generated_at=ds.get('generatedAt'), remarks=None,
        )
        db.session.add(row)
        db.session.flush()
        date_to_id[ds_key] = row.id

        for seat in ds.get('seating') or []:
            cid = roll_to_candidate_id.get(seat.get('roll'))
            if not cid:
                continue
            db.session.add(SeatingAssignment(
                date_state_id=row.id, candidate_id=cid, room_no=seat.get('roomNo'),
                seat_in_room=seat.get('seatInRoom'), row=seat.get('row'), col=seat.get('col'),
                seat_label=seat.get('seatLabel'),
            ))
        for roll, status in (ds.get('attendance') or {}).items():
            cid = roll_to_candidate_id.get(roll)
            if not cid or status is None:
                continue
            db.session.add(Attendance(date_state_id=row.id, candidate_id=cid, status=status))
    return date_to_id


def _insert_ledger(sess, date_ledger, date_to_datestate_id, roll_to_candidate_id):
    for ds_key, ledger in date_ledger.items():
        ds_id = date_to_datestate_id.get(ds_key)
        if not ds_id:
            continue
        # remarks live on DateState — patch it in now that the row exists
        ds_row = db.session.get(DateState, ds_id)
        if ds_row is not None:
            ds_row.remarks = ledger.get('remarks') or ''

        for roll, asg in (ledger.get('assignments') or {}).items():
            cid = roll_to_candidate_id.get(roll)
            if not cid:
                continue
            db.session.add(AbAssignment(
                date_state_id=ds_id, candidate_id=cid, type_id=asg.get('typeId'),
                serial_raw=asg.get('serialRaw'), assigned_at=asg.get('assignedAt'),
            ))
        for d in ledger.get('damagedSerials') or []:
            cid = roll_to_candidate_id.get(d.get('roll'))
            db.session.add(AbDamagedSerial(
                date_state_id=ds_id, serial_raw=d.get('serialRaw'), type_id=d.get('typeId'),
                candidate_id=cid, damaged_at=d.get('damagedAt'), source=d.get('source'),
            ))
        for roll, entries in (ledger.get('suppAssignments') or {}).items():
            cid = roll_to_candidate_id.get(roll)
            if not cid:
                continue
            for e in entries:
                db.session.add(AbSuppAssignment(
                    date_state_id=ds_id, candidate_id=cid, serial_raw=e.get('serialRaw'),
                    type_id=e.get('typeId'), issued_at=e.get('issuedAt'), note=e.get('note'),
                ))
        for d in ledger.get('suppDamagedSerials') or []:
            cid = roll_to_candidate_id.get(d.get('roll'))
            if not cid:
                continue
            db.session.add(AbSuppDamagedSerial(
                date_state_id=ds_id, serial_raw=d.get('serialRaw'), type_id=d.get('typeId'),
                candidate_id=cid, damaged_at=d.get('damagedAt'), source=d.get('source'),
            ))


def _insert_audit_log(sess, audit_log):
    for a in audit_log:
        db.session.add(AbAuditLog(
            id=a.get('id'), session_id=sess.id, at=a.get('at'),
            action=a.get('action'), detail=a.get('detail'), reason=a.get('reason'),
        ))


# ---------------------------------------------------------------- DELETE
@bp.delete('/<centre_code>')
def delete_session(centre_code):
    sess = Session.query.filter_by(centre_code=centre_code).first()
    if not sess:
        return jsonify({'error': 'Session not found'}), 404
    db.session.delete(sess)
    db.session.commit()
    return jsonify({'ok': True})


def register(app):
    bp_protected = bp
    # Apply login_required to every view in this blueprint except none (all session
    # data is private) — done via before_request rather than decorating each view.
    @bp_protected.before_request
    def _require_login():
        from flask import session as flask_session
        if not flask_session.get('user_id'):
            return jsonify({'error': 'Not authenticated'}), 401
    app.register_blueprint(bp_protected)
