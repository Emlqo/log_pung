"""Five-minute, student-local consecutive runs; no fuzzy URL or search matching."""
import heapq

GROUP_MS=300000
def day(at):return (at+9*3600000)//86400000
def signature(row):return (row['email'],row.get('window_id'),row['url'],row.get('search') or '')
def times(data):return data.get('_times') or [data['at']]
def stamp(data,values):
    data['_times']=values
    data['first_at']=values[0]
    data['at']=values[-1]
    data['repeat_count']=len(values)
    return data

def grouped_page(rows,lower,upper,predicate,page=1,newest=True):
    """Input is chronological. Keep one open run per student and a bounded page heap.

    Group before applying search/site filters, so a hidden B in A-B-A is a barrier.
    Legacy rows are grouped on read only. The database originals remain untouched.
    """
    pending={};heap=[];total=0;visits=0;serial=0;keep=page*100
    def emit(group):
        nonlocal total,visits,serial
        if not predicate(group):return
        total+=1;visits+=group['repeat_count'];serial+=1
        rank=(group['at'],group['id']) if newest else (-group['first_at'],group['id'])
        item=(rank,serial,group)
        if len(heap)<keep:heapq.heappush(heap,item)
        elif item[:2]>heap[0][:2]:heapq.heapreplace(heap,item)
    for row in rows:
        occurrences=[v for v in times(row) if lower<=v<=upper]
        if not occurrences:continue
        clean={k:v for k,v in row.items() if not k.startswith('_')}
        clean.update(first_at=occurrences[0],at=occurrences[-1],repeat_count=len(occurrences))
        old=pending.get(row['email'])
        if old and signature(old)==signature(clean) and clean['first_at']>=old['at'] and clean['at']-old['first_at']<=GROUP_MS and day(clean['at'])==day(old['first_at']):
            old['at']=clean['at'];old['repeat_count']+=clean['repeat_count']
            old['received_at']=max(old['received_at'],clean['received_at'])
        else:
            if old:emit(old)
            pending[row['email']]=clean
    for group in pending.values():emit(group)
    ordered=sorted(heap,reverse=True)
    return [entry[2] for entry in ordered[(page-1)*100:page*100]],total,visits
