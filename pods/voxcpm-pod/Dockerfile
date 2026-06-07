FROM python:3.10-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libsndfile1 \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
RUN mkdir -p /app/cache

ENV PYTHONPATH=/app/src
ENV PORT=3006
ENV AUDIO_CACHE=/app/cache
ENV MODEL_ID=openbmb/VoxCPM2

EXPOSE 3006
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "3006"]
