/** */
/*global BigInt */
/*global BigInt64Array */

import {loadTokenizer} from './bert_tokenizer.ts';

const ort = require('onnxruntime-web');
ort.env.wasm.numThreads = 2;
ort.env.wasm.simd = true;
const options = {
  executionProviders: ['wasm'], 
  graphOptimizationLevel: 'all'
};

const session = ort.InferenceSession.create('./xtremedistil-int8.onnx', options);
const tokenizer = loadTokenizer()

function softMax(logits) {
  const maxLogit = Math.max(...logits);
  const scores = logits.map(s => Math.exp(s - maxLogit));
  const denom = scores.reduce((a, b) => a + b);
  return scores.map(s => s / denom);
}

const empty = [
  ["Emotion", "Score"],
  ['Sadness 😥',0],
  ['Joy 😂', 0],
  ['Love ❤️', 0],
  ['Anger 😠', 0],
  ['Fear 😱', 0],
  ['Surprise 😲', 0]
];

async function lm_inference(text) {
    try { 
      const encoded = await tokenizer.then(t => {
        return t.tokenize(text); 
      });
      if(encoded.length === 0) {
        return empty;
      }

      var input_ids = new Array(encoded.length+2);
      var attention_mask = new Array(encoded.length+2);
      var token_type_ids = new Array(encoded.length+2);

      input_ids[0] = BigInt(101);
      attention_mask[0] = BigInt(1);
      token_type_ids[0] = BigInt(0);
      var i = 0;
      for(; i < encoded.length; i++) { 
        input_ids[i+1] = BigInt(encoded[i]);
        attention_mask[i+1] = BigInt(1);
        token_type_ids[i+1] = BigInt(0);
      }
      input_ids[i+1] = BigInt(102);
      attention_mask[i+1] = BigInt(1);
      token_type_ids[i+1] = BigInt(0);
      const sequence_length = input_ids.length;
      input_ids = new ort.Tensor('int64', BigInt64Array.from(input_ids), [1,sequence_length]);
      attention_mask = new ort.Tensor('int64', BigInt64Array.from(attention_mask), [1,sequence_length]);
      token_type_ids = new ort.Tensor('int64', BigInt64Array.from(token_type_ids), [1,sequence_length]);
      const start = performance.now();
      const feeds = { input_ids: input_ids, token_type_ids: token_type_ids, attention_mask:attention_mask};
      const output =  await session.then(session => { return session.run(feeds,['output_0'])});
      const duration = performance.now() - start;
    
      console.log("Inference latency = " + duration.toFixed(2) + "ms, sequence_length=" + sequence_length);
      const probs = softMax(output['output_0'].data);
      const rounded_probs = probs.map( t => Math.floor(t*100));
      return [
        ["Emotion", "Score"],
        ['Sadness 😥', rounded_probs[0]],
        ['Joy 😂', rounded_probs[1]],
        ['Love ❤️', rounded_probs[2]],
        ['Anger 😠', rounded_probs[3]],
        ['Fear 😱', rounded_probs[4]],
        ['Surprise 😲', rounded_probs[5]],
      ];    
    } catch (e) {
        return empty;
    }
}    

export let inference = lm_inference 
export let columnNames = empty