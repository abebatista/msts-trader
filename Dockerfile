FROM python:3.12-slim

WORKDIR /app

COPY pyproject.toml README.md LICENSE ./
COPY msts_trader ./msts_trader

RUN pip install --no-cache-dir ".[all]"

# Persist keychain secrets + Schwab OAuth tokens inside the single ~/.msts-trader volume
ENV MSTS_KEYCHAIN_FILE=/root/.msts-trader/keychain.json \
    MSTS_UI_HOST=0.0.0.0 \
    MSTS_UI_PORT=8765 \
    MSTS_SCHWAB_MANUAL=1 \
    BROWSER=/bin/true \
    PYTHONUNBUFFERED=1

EXPOSE 8765

VOLUME ["/root/.msts-trader"]

ENTRYPOINT ["msts-trader"]
CMD ["ui", "--no-browser"]
