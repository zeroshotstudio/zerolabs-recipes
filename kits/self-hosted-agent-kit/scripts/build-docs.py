#!/usr/bin/env python3
"""Generate the in-app/offline guide from the maintained Markdown manuals."""
from pathlib import Path
import html, re
root=Path(__file__).resolve().parent.parent
sources=[('start',root/'README.md'),('access',root/'docs/QUICKSTART.md'),('api',root/'docs/DEVELOPER-GUIDE.md'),('recovery',root/'docs/HARDENING-CHECKLIST.md'),('support',root/'docs/SUPPORT-GUIDE.md')]
def inline(text):
    text=html.escape(text)
    text=re.sub(r'`([^`]+)`',r'<code>\1</code>',text)
    text=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',text)
    def link(m):
        label,url=m.groups()
        if url.startswith('https://'):return f'<a href="{url}" target="_blank" rel="noopener">{label}</a>'
        return label
    return re.sub(r'\[([^]]+)\]\(([^)]+)\)',link,text)
def render(text):
    output=[];code=None;inlist=False;table=False
    for line in text.splitlines()+['']:
        if line.startswith('```'):
            if code is None:code=[]
            else:output.append('<pre class="code">'+html.escape('\n'.join(code))+'</pre>');code=None
            continue
        if code is not None:code.append(line);continue
        if line.startswith('|'):
            cells=[x.strip() for x in line.strip('|').split('|')]
            if all(re.fullmatch(r'[:\- ]+',x) for x in cells):continue
            if not table:output.append('<table tabindex="0"><tbody>');table=True
            output.append('<tr>'+''.join('<td>'+inline(x)+'</td>' for x in cells)+'</tr>');continue
        if table:output.append('</tbody></table>');table=False
        item=re.match(r'^(?:- |\d+\. )(.*)',line)
        if item:
            if not inlist:output.append('<ul>');inlist=True
            output.append('<li>'+inline(item[1])+'</li>');continue
        if inlist:output.append('</ul>');inlist=False
        heading=re.match(r'^(#{1,3}) (.*)',line)
        if heading:
            n=min(4,len(heading[1])+1);output.append(f'<h{n}>'+inline(heading[2])+f'</h{n}>')
        elif line:output.append('<p>'+inline(line)+'</p>')
    return '\n'.join(output)
body='\n'.join(f'<section id="{id}">{render(path.read_text())}</section>' for id,path in sources)
# Stable deep links used by the application.
body=body.replace('<h3>Configuration</h3>','<h3 id="models">Configuration</h3>').replace('<h3>MCP</h3>','<h3 id="mcp">MCP</h3>')
page='''<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Kit documentation · ZeroLabs</title><link rel="stylesheet" href="STYLE_PATH"><link rel="icon" href="/favicon.svg"></head><body><main class="doc-layout"><a href="/">← Open workspace</a><h1>Agent Kit documentation</h1><p>Version 2.0 · Install, operate, connect and recover your workspace.</p><nav class="doc-nav" aria-label="Guide sections"><a href="#start">Overview</a><a href="#access">Setup & access</a><a href="#models">AI models</a><a href="#api">API</a><a href="#mcp">MCP</a><a href="#recovery">Recovery</a><a href="#support">Troubleshooting</a></nav>'''+body+'</main></body></html>'
(root/'app/public/docs.html').write_text(page.replace('STYLE_PATH','/style.css'))
(root/'docs/index.html').write_text(page.replace('STYLE_PATH','../app/public/style.css'))
print('Built app and offline documentation')
