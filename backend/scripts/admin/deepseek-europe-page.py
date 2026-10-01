"""Read-only progress page for the historical-tour batch."""
import hashlib, html, json, os
import overpass_control
from datetime import datetime, timezone
from pathlib import Path
B=Path(__file__).resolve().parents[2]/'tmp/pilot-batch-europe-20260920'
read=lambda p:json.loads(Path(p).read_text())
def save(p,value):
 p=Path(p);t=p.with_suffix('.tmp');t.write_text(json.dumps(value,ensure_ascii=False,indent=2));t.replace(p)
def index():
 esc=lambda x:html.escape(str(x),quote=True)
 duration=lambda seconds:f'{int(round(seconds))//60}:{int(round(seconds))%60:02d}'
 m=read(B/'manifest.json');ts=read(B/'text-status.json') if (B/'text-status.json').exists() else {};au=read(B/'audio-status.json') if (B/'audio-status.json').exists() else {};queue=read(B/'queue-status.json') if (B/'queue-status.json').exists() else {}
 parts=['<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Europa · Tours históricos</title><style>body{max-width:900px;margin:40px auto;padding:0 22px;font:18px/1.6 system-ui;background:#f8f5ef;color:#242a2b}article{border-top:1px solid #bfb8ab;padding:24px 0}audio{width:100%}summary,a{cursor:pointer}small{color:#565d60}a{color:#16584f}details{margin:12px 0}h2{margin-bottom:8px}p{max-width:75ch}</style></head><body><header><p>FRANCIA · ALEMANIA · ITALIA</p><h1>Europa, paseo a paseo</h1><p>Históricos generales en español. Objetivo: 120 minutos por recorrido entre paseo y escucha; cada ruta mostrará su estimación real. Recarga para ver los audios que vayan terminando.</p><p><small>Voz generada por inteligencia artificial. Guiones nuevos con revisión automática; revisión final del usuario pendiente.</small></p></header><main>']
 if ts.get('phase')=='paused' or au.get('phase')=='paused':parts.append('<p><strong>Generación pausada.</strong> Los audios disponibles se conservan para revisar.</p>')
 policy=queue.get('executionPolicy',{});audio_at_end=policy.get('audioAtEnd',False)
 if queue.get('preparationBlocked'):parts.append('<p><strong>Preparación detenida por el servicio de mapas.</strong> Se conservan las fuentes reunidas y continúan los guiones que ya estaban preparados. El reintento automático tiene un límite y conserva el trabajo válido.</p>')
 alive=False
 if queue.get('processAlive'):
  try:os.kill(queue['pid'],0);alive=True
  except (ProcessLookupError,KeyError):pass
 mode='Todas las ciudades · rutas y guiones en paralelo · audios al final del lote.' if audio_at_end else 'Pilotos de fiabilidad: Marsella, Hamburgo y Venecia.'
 parts.append('<p><strong>Proceso '+('activo' if alive else 'detenido')+'</strong> · '+mode+'</p>')
 if audio_at_end:
  limits=policy.get('limits',{});ready_texts=sum(s.get('text',{}).get('phase')=='ready' for s in queue.get('cities',{}).values())
  parts.append('<p>'+str(ready_texts)+' de 30 guiones listos. Hasta '+str(limits.get('prepare',2))+' rutas y '+str(limits.get('text',4))+' guiones a la vez. Al terminar esta fase, se generarán los audios de los tours aprobados. Las incidencias se mantendrán visibles.</p>')
 maps=overpass_control.read_status()
 if maps.get('version')==1:
  incident=maps.get('incident') or {};active=maps.get('active');metrics=maps.get('metrics') or {}
  parts.append('<section aria-label="Estado de las descargas de mapas"><h2>Descargas de mapas</h2><p>Límite compartido: una petición a la vez. '+('Hay una petición registrada en curso.' if active else 'Ninguna petición registrada en curso.')+'</p>')
  if incident.get('exhausted'):parts.append('<p><strong>Recuperación del servicio agotada.</strong> Se conserva el trabajo completado; no se envían nuevas consultas.</p>')
  elif incident:
   when=datetime.fromtimestamp(incident['retryAt']/1000,timezone.utc).isoformat()
   parts.append('<p>Próxima comprobación compartida: '+esc(when)+' · Intentos restantes: '+str(max(0,3-incident['windowsUsed']))+'</p>')
  for endpoint,provider in (maps.get('providers') or {}).items():
   if provider.get('restricted'):parts.append('<p>Acceso restringido: '+esc(endpoint)+'</p>')
   elif provider.get('retryAt',0)>datetime.now(timezone.utc).timestamp()*1000:
    when=datetime.fromtimestamp(provider['retryAt']/1000,timezone.utc).isoformat()
    parts.append('<p>Proveedor en espera: '+esc(endpoint)+' · Hasta '+esc(when)+'</p>')
  parts.append('<p><small>Consultas enviadas registradas: '+str(metrics.get('requests',0))+' · Reutilizaciones registradas por el control compartido: '+str(metrics.get('cacheHits',0))+'</small></p></section>')
 elif maps.get('phase')=='invalid_state':parts.append('<p><strong>'+esc(maps['message'])+'</strong></p>')
 labels={'waiting_sources':'Esperando al servicio de fuentes','paused':'Pausado; se conserva lo completado','blocked':'Esperando a la fase anterior','queued':'En cola','preparing':'Preparando el histórico general','prepared':'Ruta y fuentes preparadas','research':'Reuniendo fuentes','writing':'Preparando el guion','reviewing':'Revisando el guion','ready':'Guion listo; audio en cola','validating':'Comprobando archivos','rendering':'Generando audio','assembling':'Uniendo capítulos','completed':'Disponible','error':'Pendiente de revisar una incidencia'};completed=0
 for c in m['cities']:
  slug=c['slug'];d=B/slug;f=d/'listening-result.json';state=au.get('cities',{}).get(slug,{})
  if state.get('phase','queued')=='queued':state=ts.get('cities',{}).get(slug,{})
  stages=queue.get('cities',{}).get(slug)
  if stages:
   state=next(({**stages[stage],'stage':stage} for stage,ready in [('prepare','prepared'),('text','ready'),('audio','completed')] if stages[stage]['phase']!=ready),stages['audio'])
   if audio_at_end and state.get('stage')=='audio' and state.get('phase')=='queued':state={**state,'message':'Guion listo; audio pendiente del lote final.'}
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
   if state.get('retryNotBefore'):parts.append('<p>Próximo intento: '+esc(state['retryNotBefore'])+(' · Ventanas restantes: '+esc(state['recoveryWindowsRemaining']) if state.get('recoveryWindowsRemaining') is not None else '')+'</p>')
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
 parts.append('</main><footer><p>'+str(completed)+' de 30 tours disponibles.</p></footer></body></html>');p=B/'escuchar.html';t=p.with_suffix('.html.'+str(os.getpid())+'.tmp');t.write_text('\n'.join(parts));t.replace(p)
 if completed==30:save(B/'completion.json',{'cities':30,'language':'es','review':'Pending user review','completedAudioTours':completed})

if __name__=='__main__': index()
