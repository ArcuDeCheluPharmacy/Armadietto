

const KEY='farmaci';
let editingId=null;

const getData=()=>JSON.parse(localStorage.getItem(KEY)||'[]');
const setData=d=>localStorage.setItem(KEY,JSON.stringify(d));

function daysUntil(date){
 if(!date) return null;
 const d=new Date(date+'T00:00:00');
 const now=new Date(); now.setHours(0,0,0,0);
 return Math.floor((d-now)/86400000);
}
function status(date){
 const d=daysUntil(date);
 if(d===null) return 'N/D';
 if(d<0) return 'Scaduto';
 if(d<=30) return 'In scadenza';
 return 'OK';
}

function showView(v){
 homeView.hidden=v!=='home';
 inventoryView.hidden=v!=='inventory';
 formView.hidden=v!=='form';
 if(v==='home') renderHome();
 if(v==='inventory') renderInventory();
}

function renderHome(){
 const data=getData();
 const scaduti=data.filter(x=>daysUntil(x.scadenza)<0).length;
 const soon=data.filter(x=>{let d=daysUntil(x.scadenza); return d!==null && d>=0 && d<=30}).length;
 homeView.innerHTML=`<div class=card><h2>Dashboard</h2>
 <p>Totale farmaci: <b>${data.length}</b></p>
 <p>In scadenza ≤30 giorni: <b>${soon}</b></p>
 <p>Scaduti: <b>${scaduti}</b></p></div>`;
}

function renderInventory(){
 const data=getData();
 inventoryView.innerHTML=`<div class=card>
 <input id=search placeholder='Cerca...' oninput='renderInventory()'>
 </div>
 <table><thead><tr><th>Nome</th><th>Q.tà</th><th>Formato</th><th>Scadenza</th><th>Posizione</th><th>Stato</th><th>Azioni</th></tr></thead>
 <tbody>${
 data.filter(r=>{
 let q=(document.getElementById('search')?.value||'').toLowerCase();
 return !q || JSON.stringify(r).toLowerCase().includes(q);
 }).map(r=>`<tr>
 <td>${r.nome}</td><td>${r.quantita}</td><td>${r.formato||''}</td>
 <td>${r.scadenza||''}</td><td>${r.posizione||''}</td><td>${status(r.scadenza)}</td>
 <td><button onclick="editFarmaco('${r.id}')">Modifica</button>
 <button onclick="deleteFarmaco('${r.id}')">Elimina</button></td></tr>`).join('')
 }</tbody></table>`;
}

function openForm(item=null){
 editingId=item?.id||null;
 showView('form');
 formView.innerHTML=`<div class=card><h2>${item?'Modifica':'Aggiungi'} farmaco</h2>
 <form onsubmit="saveFarmaco(event)">
 <div class=grid>
 <div><label>Nome</label><input id=nome value="${item?.nome||''}" required></div>
 <div><label>Quantità</label><input id=quantita type=number value="${item?.quantita||1}"></div>
 <div><label>Formato</label><input id=formato value="${item?.formato||''}"></div>
 <div><label>Scadenza</label><input id=scadenza type=date value="${item?.scadenza||''}"></div>
 <div><label>Posizione</label><input id=posizione value="${item?.posizione||''}"></div>
 </div><button type=submit>${item?'Salva':'Aggiungi'}</button></form></div>`;
}

function saveFarmaco(e){
 e.preventDefault();
 const data=getData();
 const obj={id:editingId||crypto.randomUUID(),nome:nome.value,quantita:+quantita.value,
 formato:formato.value,scadenza:scadenza.value,posizione:posizione.value};
 const idx=data.findIndex(x=>x.id===obj.id);
 if(idx>=0)data[idx]=obj; else data.push(obj);
 setData(data);
 showView('inventory');
}

function editFarmaco(id){ openForm(getData().find(x=>x.id===id)); }
function deleteFarmaco(id){
 if(!confirm('Eliminare il farmaco?')) return;
 setData(getData().filter(x=>x.id!==id));
 renderInventory();
}
renderHome();
