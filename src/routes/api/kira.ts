import {createFileRoute} from "@tanstack/react-router";
import {GoogleGenAI} from "@google/genai";
import {buildKiraPrompt} from "../../server";

type KiraRequest={message:string;context:unknown;history?:{role:"user"|"model";text:string}[]};

function getKeys(){return (process.env.GEMINI_API_KEYS||process.env.GEMINI_API_KEY||"").split(",").map(k=>k.trim()).filter(Boolean);}

async function callGemini(body:KiraRequest){
 const keys=getKeys();
 if(!keys.length) throw new Error("GEMINI_API_KEY(S) não configurada(s).");
 let lastError:unknown;
 for(const key of keys){
  try{
   const ai=new GoogleGenAI({apiKey:key});
   const contents=[...(body.history||[]).map(x=>({role:x.role,parts:[{text:x.text}]})),{role:"user",parts:[{text:body.message}]}];
   const result=await ai.models.generateContent({model:"gemini-2.5-flash",config:{systemInstruction:buildKiraPrompt(body.context),temperature:0.7,maxOutputTokens:1200,responseMimeType:"application/json"},contents});
   const raw=result.text||""; try{const parsed=JSON.parse(raw) as {text?:string;suggestions?:unknown[]};return {text:parsed.text||"Não consegui formular uma resposta agora.",suggestions:Array.isArray(parsed.suggestions)?parsed.suggestions:[]};}catch{return {text:raw||"Não consegui formular uma resposta agora.",suggestions:[]};}
  }catch(error){lastError=error;}
 }
 throw lastError instanceof Error?lastError:new Error("Falha ao consultar Gemini.");
}

export const Route=createFileRoute("/api/kira")({
 server:{
  handlers:{
   POST:async({request})=>{
    try{
     const body=await request.json() as KiraRequest;
     if(!body.message?.trim()) return Response.json({error:"Mensagem vazia."},{status:400});
     const text=await callGemini(body);
     return Response.json(text);
    }catch(error){
     console.error("Kira API error:",error);
     return Response.json({error:"A Kira não conseguiu responder agora. Verifique a configuração da Gemini API."},{status:500});
    }
   }
  }
 }
});
