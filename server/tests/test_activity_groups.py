import json
from uuid import uuid4
from datetime import datetime
from sqlalchemy import select,delete,func
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient
import student_test_app as module
from student_test_app import StudentEvent,EventReceipt,TestWindow as Window,CleanupState,KST,create_student_app
from activity_groups import grouped_page
from test_student_app import AUTH,BASE,config,client,begin,upload

def visit(at,url='https://example.test/a',search=None,**changes):
    return dict(id=str(uuid4()),at=at,url=url,search=search,kind='visit',**changes)
def start(client):
    w=begin(client)
    with Session(client.app.state.engine) as db:db.get(Window,'school-pilot').starts=module.now()-86400000;db.commit()
    return w
def view(client,**params):
    response=client.get('/api/teacher/view',params={'period':'7d',**params},auth=AUTH)
    assert response.status_code==200;return response.json()

def test_repeats_compact_and_retries_dont_inflate_after_restart(client,config):
    w=start(client);at=module.now()-60000
    events=[visit(at+i*100) for i in range(20)]
    assert upload(client,w,events).status_code==200
    with Session(client.app.state.engine) as db:
        assert db.scalar(select(func.count()).select_from(StudentEvent))==1
        assert db.scalar(select(func.count()).select_from(EventReceipt))==20
    with TestClient(create_student_app(config)) as restarted:
        assert upload(restarted,w,events).status_code==200
        result=view(restarted);assert result['total']==1 and result['visit_count']==20
        row=result['events'][0];assert row['first_at']==at and row['at']==events[-1]['at'] and row['repeat_count']==20
        assert not any(k.startswith('_') for k in row)
        assert upload(restarted,w,[{**events[4],'kind':'spa'}]).status_code==409
        assert view(restarted)['visit_count']==20

def test_other_student_does_not_break_but_other_url_search_and_window_do(client):
    w=start(client);at=module.now()-60000
    upload(client,w,[visit(at)])
    upload(client,w,[visit(at+1)],email='b@goedu.kr')
    upload(client,w,[visit(at+2),visit(at+3,url='https://example.test/b'),visit(at+4),visit(at+5,search='검색')])
    result=view(client,email=BASE['email'],site='example.test')
    assert [r['repeat_count'] for r in result['events']]==[1,1,1,2]
    filtered=view(client,query='https://example.test/a',email=BASE['email'])
    assert filtered['total']==3  # the filtered-out B remains a boundary
    client.post('/api/teacher/window/stop',auth=AUTH)
    w2=start(client);upload(client,w2,[visit(module.now())])
    assert view(client,email=BASE['email'])['total']==5

def test_first_visit_five_minute_limit_and_korean_day_boundary(client,monkeypatch):
    now=int(datetime(2026,10,7,1,tzinfo=KST).timestamp()*1000);monkeypatch.setattr(module,'now',lambda:now)
    w=start(client);at=now-600000
    upload(client,w,[visit(at),visit(at+300000),visit(at+300001)])
    assert [r['repeat_count'] for r in view(client)['events']]==[1,2]
    midnight=int(datetime(2026,10,7,0,tzinfo=KST).timestamp()*1000)
    upload(client,w,[visit(midnight-1,url='https://day.test/'),visit(midnight,url='https://day.test/')])
    assert view(client,site='day.test')['total']==2

def test_delayed_intervening_visit_splits_stored_group(client):
    w=start(client);at=module.now()-10000
    first=[visit(at),visit(at+2000),visit(at+4000)]
    upload(client,w,first)
    upload(client,w,[visit(at+1000,url='https://example.test/b')])
    result=view(client,query='https://example.test/a')
    assert result['total']==2 and result['visit_count']==3
    assert upload(client,w,first).status_code==200
    assert view(client)['visit_count']==4

def test_partial_time_range_and_retention_trim_counts(client,monkeypatch):
    at=module.now()-10000;w=start(client)
    events=[visit(at),visit(at+2000),visit(at+4000)];upload(client,w,events)
    clipped=view(client,until=at+2000)
    assert clipped['events'][0]['repeat_count']==2
    future=at+module.RETENTION_MS+1000;monkeypatch.setattr(module,'now',lambda:future)
    with Session(client.app.state.engine) as db:db.execute(delete(CleanupState));db.commit()
    result=view(client)
    assert result['visit_count']==2 and result['events'][0]['first_at']==at+2000
    with Session(client.app.state.engine) as db:
        assert db.scalar(select(func.count()).select_from(EventReceipt))==2
        assert json.loads(db.scalar(select(StudentEvent.data)))['_times']==[at+2000,at+4000]

def test_legacy_read_grouping_is_before_pagination_and_keeps_originals(client):
    at=module.now()-1000
    with Session(client.app.state.engine) as db:
        for i in range(205):
            data=visit(at+i)
            db.add(StudentEvent(key=str(uuid4()),email=BASE['email'],window_id='legacy',received=at,data=json.dumps(data)))
        db.commit()
    result=view(client)
    assert result['total']==1 and result['visit_count']==205
    with Session(client.app.state.engine) as db:assert db.scalar(select(func.count()).select_from(StudentEvent))==205

def test_conflicting_retry_rolls_back_prior_merge_in_same_request(client):
    w=start(client);at=module.now()-1000;original=visit(at)
    upload(client,w,[original])
    assert upload(client,w,[visit(at+1),{**original,'search':'changed'}]).status_code==409
    assert view(client)['visit_count']==1

def test_page_counts_use_groups_and_sort_modes():
    rows=[dict(id=str(i),email='a',window_id='x',url='https://example.test/'+str(i//2),search='',at=i,received_at=i) for i in range(402)]
    result,total,visits=grouped_page(rows,0,999,lambda _:True,page=2,newest=True)
    assert total==201 and visits==402 and len(result)==100 and result[0]['url'].endswith('/100')
    oldest,_,_=grouped_page(rows,0,999,lambda _:True,page=1,newest=False)
    assert oldest[0]['first_at']==0 and oldest[-1]['first_at']==198
