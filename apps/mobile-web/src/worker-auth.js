import {initializeApp} from 'firebase/app';
import {getAuth,onAuthStateChanged,GoogleAuthProvider,OAuthProvider,signInWithPopup,signOut} from 'firebase/auth';
import {native} from './sensor-transport.js';
const config=typeof SEAT_FIREBASE_CONFIG==='undefined'?{}:SEAT_FIREBASE_CONFIG;
export const authConfigured=!native&&!!(config.apiKey&&config.authDomain&&config.projectId&&config.appId);
let auth;
export function observeAccount(callback){if(!authConfigured){callback(null);return;}auth=getAuth(initializeApp(config));onAuthStateChanged(auth,callback,()=>callback(null));}
export async function login(provider){if(!auth)throw Error('먼저 Firebase 프로젝트 설정이 필요해요.');const p=provider==='apple'?new OAuthProvider('apple.com'):new GoogleAuthProvider();p.addScope('email');try{await signInWithPopup(auth,p);}catch(error){throw Error(error.code==='auth/popup-blocked'?'로그인 팝업을 허용해 주세요.':error.code==='auth/operation-not-allowed'?'로그인 제공자 설정이 필요해요.':'로그인하지 못했어요. 다시 시도해 주세요.');}}
export async function logout(){await signOut(auth);}
