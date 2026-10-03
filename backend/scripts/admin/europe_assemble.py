import hashlib, html, json, os, shutil, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];B=Path(os.environ.get('BATCH_STAGE') or ROOT/'backend/tmp/pilot-batch-europe-20260920')
import tour_compilation
from utils.tour_audio_input import prepare_input
read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(p,data):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);t=p.with_suffix(p.suffix+'.'+str(os.getpid())+'.tmp');t.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');t.replace(p)
def check_inputs(d):
 frozen=read(d/'frozen.json');assert sha(d/'master.json')==frozen['masterSha256'];assert sha(d/'audio-input.json')==frozen['inputSha256']
 m=read(d/'master.json');prepared=prepare_input(d/'audio-input.json',ROOT/'pods/voxcpm-pod/presets/guide-es-a.json');assert len(prepared['stops'])==len(m['pieces']);return m,prepared
def assemble(slug):
 tour_compilation.assemble(B/slug,check_inputs)
def index():
 esc=lambda x:html.escape(str(x),quote=True)
 duration=lambda seconds:f'{int(round(seconds))//60}:{int(round(seconds))%60:02d}'
 m=read(B/'manifest.json');ts=read(B/'text-status.json') if (B/'text-status.json').exists() else {};au=read(B/'audio-status.json') if (B/'audio-status.json').exists() else {};queue=read(B/'queue-status.json') if (B/'queue-status.json').exists() else {}
 parts=['<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Europa · Tours históricos</title><style>body{max-width:900px;margin:40px auto;padding:0 22px;font:18px/1.6 system-ui;background:#f8f5ef;color:#242a2b}article{border-top:1px solid #bfb8ab;padding:24px 0}audio{width:100%}summary,a{cursor:pointer}small{color:#565d60}a{color:#16584f}details{margin:12px 0}h2{margin-bottom:8px}p{max-width:75ch}</style></head><body><header><p>FRANCIA · ALEMANIA · ITALIA</p><h1>Europa, paseo a paseo</h1><p>Históricos generales en español. Objetivo: 120 minutos por recorrido entre paseo y escucha; cada ruta mostrará su estimación real. Recarga para ver los audios que vayan terminando.</p><p><small>Voz generada por inteligencia artificial. Guiones nuevos con revisión automática; revisión final del usuario pendiente.</small></p></header><main>']
 if ts.get('phase')=='paused' or au.get('phase')=='paused':parts.append('<p><strong>Generación pausada.</strong> Los audios disponibles se conservan para revisar.</p>')
 if queue.get('preparationBlocked'):parts.append('<p><strong>Preparación detenida por el servicio de mapas.</strong> Se conservan las fuentes reunidas y continúan los guiones y audios que ya estaban preparados. La preparación requiere reanudación cuando se recupere el servicio.</p>')
 labels={'waiting_sources':'Esperando al servicio de fuentes','paused':'Pausado; se conserva lo completado','blocked':'Esperando a la fase anterior','queued':'En cola','preparing':'Preparando el histórico general','prepared':'Ruta y fuentes preparadas','research':'Reuniendo fuentes','writing':'Preparando el guion','reviewing':'Revisando el guion','ready':'Guion listo; audio en cola','validating':'Comprobando archivos','rendering':'Generando audio','assembling':'Uniendo capítulos','completed':'Disponible','error':'Pendiente de revisar una incidencia'};completed=0
 for c in m['cities']:
  slug=c['slug'];d=B/slug;f=d/'listening-result.json';state=au.get('cities',{}).get(slug,{})
  if state.get('phase','queued')=='queued':state=ts.get('cities',{}).get(slug,{})
  stages=queue.get('cities',{}).get(slug)
  if stages:
   state=next(({**stages[stage],'stage':stage} for stage,ready in [('prepare','prepared'),('text','ready'),('audio','completed')] if stages[stage]['phase']!=ready),stages['audio'])
  if state.get('phase')=='preparing' and (d/'source-readiness.json').exists():
   try:
    readiness=read(d/'source-readiness.json')
    if readiness.get('phase')=='waiting_sources':state=readiness
   except (ValueError,OSError):pass
  parts.append('<article id="'+esc(slug)+'"><h2>'+esc(c['city'])+'</h2><p><small>'+esc(c['country'])+'</small></p>');master=read(d/'master.json') if (d/'master.json').exists() else None
  if (d/'inputs.json').exists():
   snapshot=read(d/'inputs.json')['snapshot'];scope=snapshot.get('routePlanning',{}).get('scope')
   if scope:parts.append('<p><strong>Ámbito del paseo:</strong> '+esc(scope)+'</p>')
   if snapshot.get('geometry',{}).get('guidedDurationMinutes'):parts.append('<p>Duración estimada del recorrido: '+esc(snapshot['geometry']['guidedDurationMinutes'])+' minutos entre paseo y paradas.</p>')
  if f.exists():
   r=read(f);completed+=1;url=slug+'/tour.mp3';parts.append(f'<p><strong>Tour completo · {duration(r["durationSeconds"])}</strong><br><small>Incluye la bienvenida, todas las paradas y el cierre.</small></p><audio aria-label="Tour de {esc(c["city"])}" controls preload="none" src="{url}"></audio><p><a download href="{url}">Descargar audio</a> · <a href="{slug}/script.txt">Leer guion</a></p>')
  else:
   parts.append('<p>'+esc(state.get('message') or labels.get(state.get('phase','queued'),state.get('phase','queued')))+'</p>')
   progress=d/'tts-job/progress.json'
   if progress.exists():
    audio_progress=read(progress);done=len(audio_progress.get('results',[]));total=len(master['pieces']) if master else 0
    if done and total:parts.append('<p><small>'+str(done)+' de '+str(total)+' capítulos de audio guardados.</small></p>')
  route=read(d/'walking-route.json') if (d/'walking-route.json').exists() else None
  if route and 'distanceMeters' in route:parts.append(f'<p>Recorrido estimado: {route["distanceMeters"]/1000:.1f} km · {route["durationSeconds"]/60:.0f} minutos a pie, más la escucha. Coordenadas orientativas; recorrido pendiente de revisión.</p>')
  if master:
   chapters={ch['id']:ch for ch in read(f)['chapters']} if f.exists() else {}
   for p in master['pieces']:
    label=p['name']+(' · '+duration(chapters[p['id']]['durationSeconds']) if p['id'] in chapters else '')
    parts.append('<details><summary>'+esc(label)+'</summary>')
    if p['id'] in chapters:
     url=esc(os.path.relpath(chapters[p['id']]['audio'],B));parts.append(f'<audio aria-label="{esc(p["name"])}" controls preload="none" src="{url}"></audio>')
    if p.get('coordinates'):
     co=p['coordinates'];url=f'https://www.openstreetmap.org/?mlat={co["latitude"]}&mlon={co["longitude"]}#map=18/{co["latitude"]}/{co["longitude"]}';parts.append('<p><a href="'+esc(url)+'" target="_blank" rel="noopener">Ver ubicación del monumento</a></p>')
    parts.extend('<p>'+esc(para)+'</p>' for para in p['text'].split('\n\n'));parts.append('</details>')
  if (d/'sources.md').exists():parts.append('<p><a href="'+slug+'/sources.md">Fuentes y créditos</a></p>')
  parts.append('</article>')
 parts.append('</main><footer><p>'+str(completed)+' de '+str(len(m['cities']))+' tours disponibles.</p></footer></body></html>');p=B/'escuchar.html';t=p.with_suffix('.html.'+str(os.getpid())+'.tmp');t.write_text('\n'.join(parts));t.replace(p)
 if completed==len(m['cities']):save(B/'completion.json',{'cities':len(m['cities']),'language':'es','review':'Pending user review','completedAudioTours':completed})
if __name__=='__main__':
 if '--stage' in sys.argv:
  i=sys.argv.index('--stage');B=Path(sys.argv[i+1]);del sys.argv[i:i+2]
 if sys.argv[1]=='--check':
  from collections import Counter
  assert Counter(c['countryCode'] for c in read(B/'manifest.json')['cities'])=={'FR':10,'DE':10,'IT':10}
 elif sys.argv[1]!='--index':assemble(sys.argv[1])
 index()
