import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../student/app.js',import.meta.url),'utf8');
async function scenario(disabled) {
  let authListener, profileListener, signedOut=0, renders=0, destination='';
  const store=new Map(), appView={hidden:true};
  const auth={currentUser:{uid:'student'}};
  const student={uid:'',lessons:[],profile:{role:'student',classId:'class1',disabled}};
  const window={addEventListener(){},location:{replace:value=>{destination=value;}}};
  const context=vm.createContext({console,window,location:{hash:'#/home'},sessionStorage:{getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}});
  const definitions={
    'firebase-auth.js':{onAuthStateChanged:(_auth,listener)=>{authListener=listener;},signOut:async()=>{signedOut++;auth.currentUser=null;}},
    '../js/firebase.js':{auth,db:{},offlineReady:Promise.resolve()},
    'firebase-firestore.js':{collection:()=>({}),doc:()=>({}),getDoc:async()=>({data:()=>({})}),onSnapshot:(_ref,listener)=>{profileListener=listener;return ()=>{};}},
    './sync.js':{watchSync:()=>{}},
    '../js/helpers.js':{$:()=>appView,setLoading:()=>{},navigate:()=>{},toast:()=>{}},
    './data.js':{student,loadProfile:async()=>student.profile,syncClock:()=>{},invalidateStudentData:()=>{}},
    './session.js':{refreshTopbar:()=>{}},'./router.js':{renderRoute:async()=>{renders++;},refreshEnrollment:async()=>{renders++;}},
    './gameSync.js':{gameSaves:{resume(){}}},'../js/field-errors.js':{},
  };
  const module=new vm.SourceTextModule(source,{context});
  await module.link(specifier=>{
    const key=specifier.includes('firebase-auth.js')?'firebase-auth.js':specifier.includes('firebase-firestore.js')?'firebase-firestore.js':specifier;
    const exports=definitions[key];assert.ok(exports,`Unknown import ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports),function(){for(const [name,value] of Object.entries(exports))this.setExport(name,value);},{context});
  });
  await module.evaluate();await authListener({uid:'student'});
  if(!disabled) {
    assert.equal(appView.hidden,false);assert.equal(renders,1);
    profileListener({exists:()=>true,data:()=>({...student.profile,disabled:true})});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  assert.equal(signedOut,1);assert.equal(appView.hidden,true);
  assert.equal(destination,'../index.html');assert.equal(store.get('basayaAccountDeactivated'),'true');
  assert.equal(student.profile.classId,'class1');
}
await scenario(true);await scenario(false);
console.log('PASS: disabled student sessions are rejected on initial load and signed out on live profile updates; class identity remains intact.');
