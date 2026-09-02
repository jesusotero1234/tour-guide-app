from __future__ import annotations

import threading
from typing import Sequence

import numpy as np

HISTORICAL_RETRIEVAL_INSTRUCTION = (
    "Retrieve historical passages that provide explicit evidence about the identity, "
    "chronology, transformation, function, conflict or distinctive features of a "
    "cultural heritage site."
)


def format_embedding_query(query: str, instruction: str = HISTORICAL_RETRIEVAL_INSTRUCTION) -> str:
    return f"Instruct: {instruction}\nQuery:{query}"


def format_reranker_input(instruction: str, query: str, document: str) -> str:
    return f"<Instruct>: {instruction}\n<Query>: {query}\n<Document>: {document}"


def _validate_texts(texts: Sequence[str], field_name: str) -> list[str]:
    if isinstance(texts, str):
        raise ValueError(f"{field_name} must be a sequence of strings")
    values = list(texts)
    if any(not isinstance(value, str) or not value.strip() for value in values):
        raise ValueError(f"{field_name} must contain only non-empty strings")
    return values


class QwenEmbeddingProvider:
    def __init__(
        self,
        model_id: str = "Qwen/Qwen3-Embedding-0.6B",
        dimension: int = 1024,
        max_length: int = 8192,
        batch_size: int = 8,
        device: str | None = None,
    ) -> None:
        if not model_id:
            raise ValueError("model_id must be non-empty")
        if dimension <= 0:
            raise ValueError("dimension must be positive")
        if not 1 <= max_length <= 32768:
            raise ValueError("max_length must be between 1 and 32768")
        if not 1 <= batch_size <= 64:
            raise ValueError("batch_size must be between 1 and 64")
        self.model_id = model_id
        self.dimension = dimension
        self.max_length = max_length
        self.batch_size = batch_size
        self.device = device
        self._tokenizer = None
        self._model = None
        self._resolved_device = None
        self._load_lock = threading.Lock()

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._load_lock:
            if self._model is not None:
                return
            try:
                import torch
                from transformers import AutoModel, AutoTokenizer
            except ImportError as exc:
                raise RuntimeError(
                    "torch and transformers are required for Qwen models; "
                    "install the 'models' extra"
                ) from exc

            resolved_device = self.device or (
                "cuda" if torch.cuda.is_available() else "cpu"
            )
            tokenizer = AutoTokenizer.from_pretrained(
                self.model_id,
                padding_side="left",
                trust_remote_code=False,
            )
            model = AutoModel.from_pretrained(
                self.model_id,
                dtype="auto",
                trust_remote_code=False,
            ).to(resolved_device)
            model.eval()
            self._resolved_device = resolved_device
            self._tokenizer = tokenizer
            self._model = model

    def _embed(self, texts: Sequence[str], *, is_query: bool) -> np.ndarray:
        values = _validate_texts(texts, "texts")
        if not values:
            return np.zeros((0, self.dimension), dtype=np.float32)
        self._ensure_loaded()
        import torch

        if is_query:
            values = [format_embedding_query(value) for value in values]

        embeddings: list[np.ndarray] = []
        for start in range(0, len(values), self.batch_size):
            batch = values[start : start + self.batch_size]
            inputs = self._tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=self.max_length,
                return_tensors="pt",
            ).to(self._resolved_device)
            with torch.inference_mode():
                outputs = self._model(**inputs)
            hidden_states = outputs.last_hidden_state
            attention_mask = inputs["attention_mask"]
            all_left_padded = bool(
                (attention_mask[:, -1].sum() == attention_mask.shape[0]).item()
            )
            if all_left_padded:
                pooled = hidden_states[:, -1, :]
            else:
                sequence_lengths = attention_mask.sum(dim=1) - 1
                batch_indices = torch.arange(
                    hidden_states.shape[0],
                    device=hidden_states.device,
                )
                pooled = hidden_states[batch_indices, sequence_lengths]
            pooled = torch.nn.functional.normalize(pooled, p=2, dim=1)
            embeddings.append(
                pooled.detach().float().cpu().numpy().astype(np.float32)
            )
        result = np.concatenate(embeddings, axis=0)
        if result.shape != (len(values), self.dimension):
            raise ValueError("embedding shape mismatch")
        if not np.all(np.isfinite(result)):
            raise ValueError("embedding contains non-finite values")
        return result

    def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        return self._embed(texts, is_query=False)

    def embed_queries(self, texts: Sequence[str]) -> np.ndarray:
        return self._embed(texts, is_query=True)


_RERANKER_SYSTEM_PREFIX = (
    "<|im_start|>system\n"
    "Judge whether the Document meets the requirements based on the Query and the "
    "Instruct provided. Note that the answer can only be \"yes\" or \"no\"."
    "<|im_end|>\n"
    "<|im_start|>user\n"
)
_RERANKER_ASSISTANT_SUFFIX = (
    "<|im_end|>\n"
    "<|im_start|>assistant\n"
    "<think>\n\n</think>\n\n"
)


class QwenReranker:
    def __init__(
        self,
        model_id: str = "Qwen/Qwen3-Reranker-0.6B",
        instruction: str = HISTORICAL_RETRIEVAL_INSTRUCTION,
        max_length: int = 8192,
        batch_size: int = 8,
        device: str | None = None,
    ) -> None:
        if not model_id:
            raise ValueError("model_id must be non-empty")
        if not instruction.strip():
            raise ValueError("instruction must be non-empty")
        if not 1 <= max_length <= 32768:
            raise ValueError("max_length must be between 1 and 32768")
        if not 1 <= batch_size <= 64:
            raise ValueError("batch_size must be between 1 and 64")
        self.model_id = model_id
        self.instruction = instruction
        self.max_length = max_length
        self.batch_size = batch_size
        self.device = device
        self._tokenizer = None
        self._model = None
        self._resolved_device = None
        self._no_token_id = None
        self._yes_token_id = None
        self._prefix_tokens: list[int] | None = None
        self._suffix_tokens: list[int] | None = None
        self._load_lock = threading.Lock()

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._load_lock:
            if self._model is not None:
                return
            try:
                import torch
                from transformers import AutoModelForCausalLM, AutoTokenizer
            except ImportError as exc:
                raise RuntimeError(
                    "torch and transformers are required for Qwen models; "
                    "install the 'models' extra"
                ) from exc

            resolved_device = self.device or (
                "cuda" if torch.cuda.is_available() else "cpu"
            )
            tokenizer = AutoTokenizer.from_pretrained(
                self.model_id,
                padding_side="left",
                trust_remote_code=False,
            )
            model = AutoModelForCausalLM.from_pretrained(
                self.model_id,
                dtype="auto",
                trust_remote_code=False,
            ).to(resolved_device)
            model.eval()

            no_token_id = tokenizer.convert_tokens_to_ids("no")
            yes_token_id = tokenizer.convert_tokens_to_ids("yes")
            if not isinstance(no_token_id, int) or not isinstance(yes_token_id, int):
                raise RuntimeError("reranker tokenizer lacks no/yes token ids")

            prefix_tokens = tokenizer.encode(
                _RERANKER_SYSTEM_PREFIX,
                add_special_tokens=False,
            )
            suffix_tokens = tokenizer.encode(
                _RERANKER_ASSISTANT_SUFFIX,
                add_special_tokens=False,
            )
            if self.max_length <= len(prefix_tokens) + len(suffix_tokens):
                raise ValueError("max_length leaves no room for reranker input")

            self._resolved_device = resolved_device
            self._tokenizer = tokenizer
            self._model = model
            self._no_token_id = no_token_id
            self._yes_token_id = yes_token_id
            self._prefix_tokens = prefix_tokens
            self._suffix_tokens = suffix_tokens

    def rerank(self, query: str, documents: Sequence[str]) -> list[float]:
        if not isinstance(query, str) or not query.strip():
            raise ValueError("query must be non-empty")
        values = _validate_texts(documents, "documents")
        if not values:
            return []
        self._ensure_loaded()
        import torch

        token_budget = self.max_length - len(self._prefix_tokens) - len(
            self._suffix_tokens
        )
        scores: list[float] = []
        for start in range(0, len(values), self.batch_size):
            batch = values[start : start + self.batch_size]
            formatted = [
                format_reranker_input(self.instruction, query, document)
                for document in batch
            ]
            encoded = self._tokenizer(
                formatted,
                padding=False,
                truncation="longest_first",
                return_attention_mask=False,
                max_length=token_budget,
            )
            input_ids = [
                self._prefix_tokens + item + self._suffix_tokens
                for item in encoded["input_ids"]
            ]
            padded = self._tokenizer.pad(
                {"input_ids": input_ids},
                padding=True,
                return_tensors="pt",
            )
            inputs = {
                key: value.to(self._resolved_device)
                for key, value in padded.items()
            }
            with torch.inference_mode():
                outputs = self._model(**inputs)
            logits = outputs.logits[:, -1, :]
            no_logit = logits[:, self._no_token_id]
            yes_logit = logits[:, self._yes_token_id]
            stacked = torch.stack([no_logit, yes_logit], dim=1)
            probs = torch.softmax(stacked, dim=1)
            yes_probs = probs[:, 1]
            scores.extend(
                yes_probs.detach().float().cpu().numpy().astype(np.float32).tolist()
            )

        result = np.asarray(scores, dtype=np.float32)
        if result.shape != (len(values),):
            raise ValueError("reranker score count mismatch")
        if not np.all(np.isfinite(result)) or np.any(result < 0) or np.any(result > 1):
            raise ValueError("reranker returned invalid scores")
        return [float(score) for score in result]
