import axios from 'axios';
import { ChatImageModel, createImageModel } from './TourImageModel';
jest.mock('axios');
const post = axios.post as jest.Mock;
const config = {model:'configured-vision-model',apiKey:'test-key',baseUrl:'https://api.example.test/v1/'};
beforeEach(()=>post.mockReset());
it('sends bounded multimodal input and parses strict JSON',async()=>{
 post.mockResolvedValue({data:{choices:[{message:{content:'{"selections":[]}'}}]}});
 const signal=new AbortController().signal;
 expect(await new ChatImageModel(config).complete('check',['https://upload.wikimedia.org/file.jpg'],signal)).toEqual({selections:[]});
 expect(post.mock.calls[0][0]).toBe('https://api.example.test/v1/chat/completions');
 expect(post.mock.calls[0][1]).toMatchObject({max_tokens:1800,response_format:{type:'json_object'}});
 expect(post.mock.calls[0][2]).toMatchObject({maxRedirects:0,timeout:20000,signal});
});
it.each(['https://user:pass@api.example.test/v1','http://user:pass@localhost/v1','http://remote.test/v1','https://api.example.test/v1?key=x'])('rejects unsafe configuration %s',baseUrl=>{
 expect(()=>new ChatImageModel({...config,baseUrl})).toThrow();expect(post).not.toHaveBeenCalled();
});
it('does not send arbitrary image hosts or excessive payloads',async()=>{
 const model=new ChatImageModel(config);
 await expect(model.complete('check',['https://upload.wikimedia.org.evil.test/file.jpg'])).rejects.toThrow();
 await expect(model.complete('x'.repeat(24001),[])).rejects.toThrow();
 await expect(model.complete('check',Array(5).fill('https://upload.wikimedia.org/file.jpg'))).rejects.toThrow();
 expect(post).not.toHaveBeenCalled();
});
it('does not reinterpret malformed or fenced model responses',async()=>{
 post.mockResolvedValue({data:{choices:[{message:{content:'not JSON'}}]}});
 await expect(new ChatImageModel(config).complete('check',[])).rejects.toThrow();
});
it('requires explicit image configuration rather than borrowing credentials',()=>{
 const oldModel=process.env.TOUR_IMAGES_MODEL,oldKey=process.env.TOUR_IMAGES_API_KEY;
 try{delete process.env.TOUR_IMAGES_MODEL;delete process.env.TOUR_IMAGES_API_KEY;expect(createImageModel()).toBeNull();}
 finally{if(oldModel===undefined)delete process.env.TOUR_IMAGES_MODEL;else process.env.TOUR_IMAGES_MODEL=oldModel;if(oldKey===undefined)delete process.env.TOUR_IMAGES_API_KEY;else process.env.TOUR_IMAGES_API_KEY=oldKey;}
});
