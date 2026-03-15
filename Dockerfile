FROM python:3.12-slim

WORKDIR /app

COPY dev-server.py .
COPY index.html .
COPY preview.png .
COPY favicon.png .
COPY apple-touch-icon.png .
COPY css/ css/
COPY js/ js/
COPY data/ data/

EXPOSE 8080

CMD ["python3", "dev-server.py"]
