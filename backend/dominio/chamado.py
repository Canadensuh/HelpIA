"""Camada de Domínio — o ticket (chamado) e as regras do atendimento.

Regras:
- CA-01: todo ticket tem número único, data e hora de abertura.
- CA-02: o catálogo (gênero → subgênero) define categoria, fila e prioridade.
- RN-01: a nota do colaborador precisa ter pelo menos 15 caracteres.
- RN-02: só quem assumiu o ticket (ou o gestor) pode carimbar, com uma nota
  de resolução de pelo menos 10 caracteres.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass

from backend.dominio import catalogo
from backend.dominio.erros import Conflito, DadosInvalidos
from backend.dominio.relogio import agora

AGUARDANDO = "Aguardando"
EM_ATENDIMENTO = "Em atendimento"
RESOLVIDO = "Resolvido"
STATUS_VALIDOS = (AGUARDANDO, EM_ATENDIMENTO, RESOLVIDO)

MIN_NOTA = 15
MIN_RESOLUCAO = 10
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def codigo(numero: int) -> str:
    return f"#{numero:03d}"


def validar_contato(contato: dict | None) -> dict | None:
    """Contato extra (opcional): WhatsApp, Teams ou e-mail. Sem valor = sem contato."""
    if not contato or not str(contato.get("valor") or "").strip():
        return None
    tipo = contato.get("tipo")
    valor = str(contato.get("valor")).strip()
    if tipo not in catalogo.CONTATOS:
        raise DadosInvalidos("Escolha uma forma de contato.")
    if tipo == "whatsapp":
        digitos = re.sub(r"\D", "", valor)
        if not 10 <= len(digitos) <= 13:
            raise DadosInvalidos("Informe o WhatsApp com DDD.")
        return {"tipo": tipo, "valor": valor}
    if not _EMAIL.match(valor):
        raise DadosInvalidos("Informe um e-mail válido para contato.")
    return {"tipo": tipo, "valor": valor.lower()}


@dataclass
class Chamado:
    numero: int
    descricao: str
    genero: str
    subgenero: str
    genero_titulo: str
    subgenero_titulo: str
    impacto: str
    maquina: str
    nota: str
    contato: dict | None
    solicitante: str
    solicitante_id: int | None
    categoria: str
    fila: str
    prioridade: str
    empresa_id: int | None = None
    status: str = AGUARDANDO
    analista: str | None = None
    aberto_em: str = ""
    assumido_em: str | None = None
    resolvido_em: str | None = None
    resolucao: str | None = None
    simulado: bool = False           # criado pelo Modo simulação (sai ao desligar)
    oculto_mesa: bool = False        # o colaborador tirou da coluna "Histórico" da mesa
    nivel_manual: str | None = None  # prioridade trocada pelo gestor

    @classmethod
    def montar(cls, numero: int, dados: dict, solicitante: str, solicitante_id: int | None,
               empresa_id: int | None) -> "Chamado":
        g = catalogo.genero(dados.get("genero") or "")
        if not g:
            raise DadosInvalidos("Escolha o tipo de problema.")
        sub = catalogo.subgenero(g["id"], dados.get("subgenero") or "")
        if not sub:
            raise DadosInvalidos(f"Escolha uma das opções de “{g['titulo']}”.")
        nota = str(dados.get("nota") or "").strip()
        if len(nota) < MIN_NOTA:                                     # RN-01
            raise DadosInvalidos(
                f"Escreva uma nota com pelo menos {MIN_NOTA} caracteres. Ela vai direto para o analista.",
                precisa_complemento=True,
            )
        impacto = dados.get("impacto") if dados.get("impacto") in catalogo.IMPACTOS else "eu"
        return cls(
            numero=numero,
            descricao=f"{g['titulo']} › {sub[1]}",
            genero=g["id"],
            subgenero=sub[0],
            genero_titulo=g["titulo"],
            subgenero_titulo=sub[1],
            impacto=impacto,
            maquina=str(dados.get("maquina") or "").strip()[:30],
            nota=nota[:1000],
            contato=validar_contato(dados.get("contato")),
            solicitante=(solicitante or "").strip() or "Colaborador",
            solicitante_id=solicitante_id,
            categoria=g["categoria"],
            fila=g["fila"],
            prioridade=g.get("prioridade") or ("Alta" if impacto != "eu" else "Normal"),
            empresa_id=empresa_id,
            aberto_em=dados.get("aberto_em") or agora(),
        )

    @property
    def codigo(self) -> str:
        return codigo(self.numero)

    @property
    def nivel(self) -> str:
        return catalogo.nivel(self.genero, self.subgenero, self.impacto, self.prioridade, self.nivel_manual)

    def assumir(self, analista: str) -> None:
        if self.status != AGUARDANDO:
            raise Conflito(f"Chamado {self.codigo} não está aguardando atendimento.")
        self.analista = analista
        self.status = EM_ATENDIMENTO
        self.assumido_em = agora()

    def resolver(self, nota: str) -> None:
        if self.status != EM_ATENDIMENTO:
            raise Conflito(f"Chamado {self.codigo} precisa estar em atendimento para ser resolvido.")
        nota = str(nota or "").strip()
        if len(nota) < MIN_RESOLUCAO:                                # RN-02
            raise DadosInvalidos(f"Escreva a nota de resolução (mínimo de {MIN_RESOLUCAO} caracteres).")
        self.status = RESOLVIDO
        self.resolucao = nota[:1000]
        self.resolvido_em = agora()

    def to_dict(self) -> dict:
        return {**asdict(self), "codigo": self.codigo}
