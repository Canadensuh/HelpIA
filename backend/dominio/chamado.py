"""Camada de Domínio — entidade Chamado e regras de negócio.

Regras implementadas:
- CA-01: todo chamado tem número único, data e hora de abertura.
- CA-02: o chamado é classificado por categoria e direcionado a uma fila.
- RN-01: descrições insuficientes não geram chamado; é preciso complementar.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass, field
from datetime import datetime

# Status possíveis do ciclo de vida de um chamado
AGUARDANDO = "Aguardando"
EM_ATENDIMENTO = "Em atendimento"
RESOLVIDO = "Resolvido"
STATUS_VALIDOS = (AGUARDANDO, EM_ATENDIMENTO, RESOLVIDO)

# RN-01: tamanho mínimo para considerar a descrição suficiente
MIN_PALAVRAS = 3
MIN_CARACTERES = 12

# CA-02: categoria -> (fila de atendimento, palavras-chave sem acento)
CATEGORIAS = {
    "Hardware": ("Suporte Técnico", {
        "computador", "notebook", "pc", "monitor", "teclado", "mouse",
        "impressora", "liga", "tela", "bateria", "fonte",
    }),
    "Rede": ("Infraestrutura", {
        "rede", "internet", "wifi", "vpn", "conexao", "conectar",
        "cabo", "lenta",
    }),
    "Acesso": ("Acessos e Identidade", {
        "senha", "login", "acesso", "acessar", "bloqueado", "bloqueada",
        "usuario", "conta", "permissao", "sso",
    }),
    "Software": ("Sistemas", {
        "sistema", "programa", "aplicativo", "excel", "word", "outlook",
        "teams", "erro", "instalar", "atualizar", "travando",
    }),
}
CATEGORIA_PADRAO = ("Geral", "Service Desk")

PALAVRAS_URGENTES = {
    "urgente", "parado", "parada", "todos", "ninguem", "cliente", "agora",
    "critico", "producao",
}


class DescricaoInsuficiente(ValueError):
    """RN-01: a mensagem não descreve o problema o suficiente."""


def normalizar(texto: str) -> str:
    """Minúsculas e sem acentos, para facilitar a comparação de palavras."""
    sem_acento = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in sem_acento if not unicodedata.combining(c)).lower()


def palavras_de(texto: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", normalizar(texto)))


def validar_descricao(descricao: str) -> str:
    """RN-01: exige um mínimo de informação antes de registrar o chamado."""
    descricao = (descricao or "").strip()
    if len(descricao.split()) < MIN_PALAVRAS or len(descricao) < MIN_CARACTERES:
        raise DescricaoInsuficiente(
            "Preciso de mais detalhes para registrar o chamado. "
            "Conte o que aconteceu, em qual equipamento ou sistema, e desde quando."
        )
    return descricao


def classificar(descricao: str) -> tuple[str, str, str]:
    """CA-02: retorna (categoria, fila, prioridade) a partir do texto."""
    palavras = palavras_de(descricao)

    categoria, fila = CATEGORIA_PADRAO
    melhor = 0
    for nome, (fila_categoria, chaves) in CATEGORIAS.items():
        acertos = len(palavras & chaves)
        if acertos > melhor:
            categoria, fila, melhor = nome, fila_categoria, acertos

    prioridade = "Alta" if palavras & PALAVRAS_URGENTES else "Normal"
    return categoria, fila, prioridade


@dataclass
class Chamado:
    numero: int
    descricao: str
    solicitante: str
    categoria: str
    fila: str
    prioridade: str
    status: str = AGUARDANDO
    analista: str | None = None
    aberto_em: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))

    @property
    def codigo(self) -> str:
        return f"#{self.numero:03d}"

    def assumir(self, analista: str) -> None:
        if self.status != AGUARDANDO:
            raise ValueError(f"Chamado {self.codigo} não está aguardando atendimento.")
        self.analista = analista
        self.status = EM_ATENDIMENTO

    def resolver(self) -> None:
        if self.status != EM_ATENDIMENTO:
            raise ValueError(f"Chamado {self.codigo} precisa estar em atendimento para ser resolvido.")
        self.status = RESOLVIDO

    def to_dict(self) -> dict:
        return {**asdict(self), "codigo": self.codigo}
