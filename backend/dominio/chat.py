"""Camada de Domínio — HelpIA Chat e metas da equipe.

- Grupo da equipe: analistas e gestores da empresa (o Helpy não participa).
- Conversa direta: analista/gestor ↔ outra pessoa. O colaborador só responde.
  Com o colaborador, a conversa é sobre um ticket em aberto dele e se
  encerra quando o ticket é carimbado.
- Mensagem sem autor (autor_id None) = aviso automático do "HelpIA".
"""
from __future__ import annotations

from dataclasses import dataclass, field

from backend.dominio.relogio import agora

GRUPO = "grupo"
DIRETA = "direta"


@dataclass
class Conversa:
    id: int
    tipo: str
    empresa_id: int
    nome: str = ""                                 # só o grupo tem nome
    membros: list[int] = field(default_factory=list)   # só a direta tem membros
    ticket: int | None = None                      # "ticket do assunto"
    encerrada: bool = False
    criada_em: str = field(default_factory=agora)


@dataclass
class Mensagem:
    id: int
    conversa_id: int
    autor_id: int | None
    texto: str
    ticket: int | None = None
    em: str = field(default_factory=agora)
    anexos: list[dict] = field(default_factory=list)   # [{ id, nome, tipo, tamanho }]
    resposta: int | None = None                    # id da mensagem respondida
    simulado: bool = False


@dataclass
class Metas:
    """Metas de uma empresa, definidas pelo gestor."""
    meta_padrao: int = 5
    por_analista: dict[int, int] = field(default_factory=dict)
    regra_do_dia: dict | None = None               # { texto, autor, em }
    motivacionais: list[dict] = field(default_factory=list)   # [{ id, texto }]
    proximo_motivacional: int = 1
