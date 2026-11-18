"""Hora oficial do HelpIA (horário de Brasília).

O servidor (Render) roda em UTC, mas o frontend mostra as datas como hora
local. Por isso as datas saem no horário de Brasília (UTC-3, sem horário de
verão desde 2019) e sem fuso no texto, no mesmo formato do simulador:
"2026-11-18T09:40:00".
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

FUSO = timezone(timedelta(hours=-3), "America/Sao_Paulo")


def agora_dt() -> datetime:
    return datetime.now(FUSO).replace(tzinfo=None, microsecond=0)


def agora() -> str:
    return agora_dt().isoformat(timespec="seconds")


def hoje() -> str:
    return agora()[:10]


def momento(dias_atras: int, hora: int, minuto: int) -> str:
    """Um horário de alguns dias atrás (dados de exemplo)."""
    dia = agora_dt() - timedelta(days=dias_atras)
    return dia.replace(hour=hora, minute=minuto, second=0).isoformat(timespec="seconds")


def minutos_atras(minutos: int) -> str:
    return (agora_dt() - timedelta(minutes=minutos)).isoformat(timespec="seconds")
