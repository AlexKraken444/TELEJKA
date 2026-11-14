# TELEJKA AI

Local inference runs in a dedicated module worker using Transformers.js 3.8.1 and onnx-community/Qwen2.5-1.5B-Instruct (revision d54957e3af1be04546436e874a60fe386041b244), q8 on single-threaded WebAssembly. No API keys or inference server are required. Model and runtime downloads use Hugging Face and jsDelivr. Model weights are browser-cached; approximate initial download is 1.6 GB. No model download occurs just from opening the feed.

Prompts stay in the browser. Chat history is localStorage scoped to the authenticated account ID, bounded to 60 entries. It is not synchronized. Chat context is bounded to 6000 characters. Editing uses at most 2000 selected characters and requires explicit acceptance before replacing the original selection. Requests are serialized per tab and can be stopped by terminating the worker.

A compact local model can make mistakes, including Russian punctuation and style. The UI must retain review-before-apply and honest device/memory limitations. There is no guarantee of support on low-memory phones. No access to real-time web information.

Source and license: https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct (Apache-2.0); ONNX weights https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct .
