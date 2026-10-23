const role=new URLSearchParams(location.search).get('view');
if(['worker','admin'].includes(role)){await import('./viewer.js');}
else{const style=document.createElement('link');style.rel='stylesheet';style.href='/rehearsal/style.css';document.head.append(style);await import('./control.js');}
