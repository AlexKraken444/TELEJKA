// Runs only in the user's browser. No prompts are sent to a server.
let generator=null,busy=false;
self.onmessage=async({data})=>{
 if(busy){self.postMessage({id:data.id,error:'ИИ уже отвечает. Дождитесь завершения.'});return}busy=true;
 try{
 if(!generator){const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');env.allowLocalModels=false;env.backends.onnx.wasm.numThreads=1;
 self.postMessage({id:data.id,status:'Загружаем Qwen — около 1,6 ГБ при первом запуске…'});
 generator=await pipeline('text-generation','onnx-community/Qwen2.5-1.5B-Instruct',{revision:'d54957e3af1be04546436e874a60fe386041b244',device:'wasm',dtype:'q8',progress_callback:p=>{if(p.status==='progress')self.postMessage({id:data.id,status:'Загрузка модели: '+Math.round(p.progress||0)+'%'});else if(p.status==='done')self.postMessage({id:data.id,status:'Подготавливаем модель…'})}});
 }
 self.postMessage({id:data.id,status:'Qwen готовит ответ…'});
 const prompt=generator.tokenizer.apply_chat_template(data.messages,{tokenize:false,add_generation_prompt:true,enable_thinking:false});
 const result=await generator(prompt,{max_new_tokens:data.mode==='edit'?512:384,do_sample:false,return_full_text:false,repetition_penalty:1.1});
 const generated=result[0].generated_text;const raw=typeof generated==='string'?generated:generated.at(-1)?.content;
 const text=raw?.includes('</think>')?raw.split('</think>').at(-1).trim():raw?.includes('<think>')?'':raw;
 if(!text?.trim())throw Error('empty');self.postMessage({id:data.id,text:text.trim()});
 }catch(e){self.postMessage({id:data.id,error:'Не удалось запустить Qwen. Проверьте интернет и свободную память, затем повторите. На слабом устройстве локальная модель может не работать.'});generator=null}finally{busy=false}
};
