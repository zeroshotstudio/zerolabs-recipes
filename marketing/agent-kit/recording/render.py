#!/usr/bin/env python3
"""Turn a genuine browser recording into captioned MP4, GIF, poster and tracks."""
import argparse, hashlib, json, pathlib, subprocess, tempfile

parser=argparse.ArgumentParser()
parser.add_argument('--recording',required=True,type=pathlib.Path)
parser.add_argument('--output',required=True,type=pathlib.Path)
args=parser.parse_args(); record=json.loads(args.recording.read_text()); out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
font=pathlib.Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
assert font.exists(), 'Install fonts-dejavu-core'
start=record['chapters'][0]['time']; length=record['end']-start; intro=4.0; outro=4.0
chapters=[{**c,'time':round(intro+c['time']-start,3)} for c in record['chapters']]

def run(argv):
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',*argv],check=True)
def timestamp(seconds):
    ms=round(seconds*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02}.{ms:03}'
def mmss(seconds):
    return f'{int(seconds)//60}:{int(seconds)%60:02}'

with tempfile.TemporaryDirectory(prefix='agentkit-render-') as temp:
    tmp=pathlib.Path(temp)
    def textfile(name,text):
        p=tmp/(name+'.txt');p.write_text(text);return p
    def text(name,text,size,x,y,color='0xf0f0f5',enable=None):
        p=textfile(name,text)
        value=f"drawtext=fontfile={font}:textfile={p}:fontsize={size}:fontcolor={color}:x={x}:y={y}:line_spacing=12"
        if enable:value+=f":enable='{enable}'"
        return value
    codec=['-r','25','-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-threads','4','-an']
    def card(filename,headline,subline,note,duration):
        filters=[
            'drawbox=x=80:y=86:w=36:h=3:color=0xafa2ff:t=fill',
            text(filename+'brand','ZEROLABS  /  AGENT KIT 2.0',18,132,75,'0xb5aec6'),
            text(filename+'title',headline,68,110,344),
            text(filename+'sub',subline,24,115,570,'0xa8a6b5'),
            'drawbox=x=110:y=660:w=1220:h=1:color=0x282832:t=fill',
            text(filename+'note',note,17,115,697,'0xa8a6b5'),
            f'fade=t=in:st=0:d=0.35,fade=t=out:st={duration-.3}:d=0.3',
        ]
        run(['-f','lavfi','-i',f'color=c=0x090a0c:s=1440x1020:r=25:d={duration}','-vf',','.join(filters),*codec,str(tmp/(filename+'.mp4'))])
    print('Rendering title cards',flush=True)
    card('intro','Your AI workspace.\nYour infrastructure.','A walkthrough of the actual Agent Kit dashboard.','Demo workspace. Scripted model responses. Real local execution.',intro)
    card('outro','See the work.\nKeep the result.','Explore Agent Kit at ZeroLabs.','Linux host and OpenAI account required. Model usage billed separately.',outro)
    filters=['pad=1440:1020:0:56:color=0x090a0c','drawbox=x=0:y=55:w=1440:h=1:color=0x302d39:t=fill','drawbox=x=0:y=956:w=1440:h=1:color=0x302d39:t=fill',text('disclosure','Demo data · scripted model responses',14,'w-tw-28',19,'0xb5aec6')]
    for i,c in enumerate(record['chapters']):
        a=c['time']-start;b=record['chapters'][i+1]['time']-start if i+1<len(record['chapters']) else length
        enable=f'gte(t,{a:.3f})*lt(t,{b:.3f})'
        filters.append(text(f'chapter-{i}',c['title'],16,28,17,'0xe5dff1',enable))
        filters.append(text(f'caption-{i}',c['caption'],23,'(w-tw)/2',978,'0xf1edf6',enable))
    print('Rendering captioned screen recording',flush=True)
    run(['-ss',f'{start:.3f}','-i',record['raw'],'-t',f'{length:.3f}','-vf',','.join(filters),*codec,str(tmp/'main.mp4')])
    listing=tmp/'concat.txt';listing.write_text(''.join(f"file '{tmp/name}'\n" for name in ['intro.mp4','main.mp4','outro.mp4']))
    movie=out/'agent-kit-walkthrough.mp4'
    run(['-f','concat','-safe','0','-i',str(listing),'-c','copy','-movflags','+faststart',str(movie)])
    duration=float(json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(movie)]))['format']['duration'])
    results=next(c for c in chapters if c['id']=='results')
    poster=out/'agent-kit-walkthrough-poster.jpg'
    run(['-ss',str(results['time']+1.5),'-i',str(movie),'-frames:v','1','-q:v','2',str(poster)])
    teaser_start=max(0,next(c for c in chapters if c['id']=='execution')['time']-1.5)
    teaser_duration=min(13.5,results['time']+5-teaser_start)
    print('Rendering GIF teaser',flush=True)
    run(['-ss',str(teaser_start),'-t',str(teaser_duration),'-i',str(movie),'-filter_complex','fps=8,scale=720:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle','-loop','0',str(out/'agent-kit-teaser.gif')])
    cues=[{'time':0,'title':'Welcome','caption':'Agent Kit product walkthrough. Demo workspace, scripted model responses, real local execution.'},*chapters,{'time':intro+length,'title':'Explore Agent Kit','caption':'Run Agent Kit on your own Linux host. Supply your OpenAI account. Model usage is billed separately.'}]
    for filename,key in [('walkthrough.en.vtt','caption'),('walkthrough-chapters.vtt','title')]:
        lines=['WEBVTT','']
        for i,c in enumerate(cues):
            end=cues[i+1]['time'] if i+1<len(cues) else duration
            lines.extend([str(i+1),f'{timestamp(c["time"])} --> {timestamp(end)}',c[key],''])
        (out/filename).write_text('\n'.join(lines))
    transcript=['ZEROLABS AGENT KIT — PRODUCT WALKTHROUGH','',record['disclosure'],'','Silent video with on-screen captions. This recording is not a live-model test, performance benchmark, or proof of a production-host deployment.','']
    for c in cues:transcript.extend([f'{mmss(c["time"])} — {c["title"]}',c['caption'],''])
    transcript.extend(['The backup shown is local. Offsite storage and target-host restore checks remain separate.','No operator credential or integration secret is shown in the recording.',''])
    (out/'walkthrough-transcript.txt').write_text('\n'.join(transcript))
    metadata={'duration':round(duration,2),'width':1440,'height':1020,'codec':'H.264 / yuv420p','audio':False,'teaser_duration':round(teaser_duration,2),'chapters':chapters,'disclosure':record['disclosure'],'checks':record['checks'],'assets':{}}
    for p in sorted(out.iterdir()):
        if p.is_file() and p.name!='walkthrough.json':metadata['assets'][p.name]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
    (out/'walkthrough.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps({'duration':duration,'mp4_bytes':movie.stat().st_size,'gif_bytes':(out/'agent-kit-teaser.gif').stat().st_size,'output':str(out)},indent=2),flush=True)
