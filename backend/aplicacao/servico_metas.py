"""Camada de Aplicação — metas da equipe, regra do dia e mensagens motivacionais."""
from __future__ import annotations

from backend.aplicacao.servico_chat import ServicoChat
from backend.dominio.chamado import RESOLVIDO
from backend.dominio.chat import Metas
from backend.dominio.erros import AcessoNegado, DadosInvalidos
from backend.dominio.relogio import agora, hoje
from backend.dominio.usuario import ANALISTA, GESTOR, Usuario
from backend.persistencia.banco import BancoMemoria


def _meta_valida(valor, mensagem: str) -> int:
    try:
        n = int(valor)
    except (TypeError, ValueError):
        raise DadosInvalidos(mensagem)
    if isinstance(valor, float) and not valor.is_integer():
        raise DadosInvalidos(mensagem)
    if not 1 <= n <= 100:
        raise DadosInvalidos(mensagem)
    return n


class ServicoMetas:
    def __init__(self, banco: BancoMemoria, chat: ServicoChat) -> None:
        self.banco = banco
        self.chat = chat

    def da_empresa(self, empresa_id: int) -> Metas:
        if empresa_id not in self.banco.metas:
            self.banco.metas[empresa_id] = Metas()
        return self.banco.metas[empresa_id]

    def metas_dict(self, usuario: Usuario) -> dict:
        metas = self.da_empresa(usuario.empresa_id)
        analistas = [u for u in self.banco.usuarios_da_empresa(usuario.empresa_id) if u.perfil == ANALISTA]
        resolvidos = [c for c in self.banco.chamados_da_empresa(usuario.empresa_id) if c.status == RESOLVIDO]
        dia = hoje()
        return {
            "meta_padrao": metas.meta_padrao,
            "regra_do_dia": metas.regra_do_dia,
            "motivacionais": metas.motivacionais,
            "analistas": [{
                "id": u.id, "nome": u.nome, "ativo": u.ativo,
                "meta": metas.por_analista.get(u.id, metas.meta_padrao),
                "personalizada": u.id in metas.por_analista,
                "feitos_hoje": sum(1 for c in resolvidos if c.analista == u.nome and (c.resolvido_em or "").startswith(dia)),
                "total": sum(1 for c in resolvidos if c.analista == u.nome),
            } for u in analistas],
            "minha_meta": metas.por_analista.get(usuario.id, metas.meta_padrao) if usuario.perfil == ANALISTA else None,
        }

    def ver(self, usuario: Usuario) -> dict:
        if not usuario.eh_equipe:
            raise AcessoNegado("Metas são da equipe de TI.")
        return self.metas_dict(usuario)

    def salvar(self, gestor: Usuario, dados: dict) -> dict:
        self._exigir_gestor(gestor)
        metas = self.da_empresa(gestor.empresa_id)
        if "meta_padrao" in dados:
            metas.meta_padrao = _meta_valida(dados["meta_padrao"], "A meta diária deve ser entre 1 e 100 tickets.")
        for chave, valor in (dados.get("por_analista") or {}).items():
            try:
                id_analista = int(chave)
            except (TypeError, ValueError):
                continue
            if valor is None or valor == "":
                metas.por_analista.pop(id_analista, None)
                continue
            metas.por_analista[id_analista] = _meta_valida(valor, "A meta deve ser entre 1 e 100 tickets.")
        if "regra_do_dia" in dados:
            texto = str(dados.get("regra_do_dia") or "").strip()[:280]
            metas.regra_do_dia = {"texto": texto, "autor": gestor.nome, "em": agora()} if texto else None
            if texto:
                self.chat.avisar_grupo(gestor.empresa_id, f"Nova regra do dia: “{texto}”")
        return self.metas_dict(gestor)

    def adicionar_motivacional(self, gestor: Usuario, texto: str) -> dict:
        self._exigir_gestor(gestor)
        texto = str(texto or "").strip()[:200]
        if len(texto) < 3:
            raise DadosInvalidos("Escreva a mensagem motivacional.")
        metas = self.da_empresa(gestor.empresa_id)
        metas.motivacionais.append({"id": metas.proximo_motivacional, "texto": texto})
        metas.proximo_motivacional += 1
        return self.metas_dict(gestor)

    def remover_motivacional(self, gestor: Usuario, id_mensagem: int) -> dict:
        self._exigir_gestor(gestor)
        metas = self.da_empresa(gestor.empresa_id)
        metas.motivacionais = [m for m in metas.motivacionais if m["id"] != id_mensagem]
        return self.metas_dict(gestor)

    @staticmethod
    def _exigir_gestor(usuario: Usuario) -> None:
        if usuario.perfil != GESTOR:
            raise AcessoNegado("Somente o gestor da empresa pode gerenciar contas.")
