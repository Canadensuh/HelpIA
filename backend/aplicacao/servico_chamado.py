"""Camada de Aplicação — a jornada do ticket.

Abrir (colaborador) → assumir (analista) → carimbar (analista, com a nota
de resolução). O gestor também pode passar o ticket para um analista,
trocar a prioridade e excluir.
"""
from __future__ import annotations

from backend.aplicacao.servico_chat import ServicoChat
from backend.aplicacao.servico_notificacao import mensagem_confirmacao
from backend.dominio import catalogo
from backend.dominio.chamado import AGUARDANDO, EM_ATENDIMENTO, RESOLVIDO, STATUS_VALIDOS, Chamado, codigo
from backend.dominio.erros import AcessoNegado, Conflito, DadosInvalidos, NaoEncontrado
from backend.dominio.relogio import agora
from backend.dominio.usuario import COLABORADOR, GESTOR, Usuario
from backend.persistencia.banco import BancoMemoria


class ServicoChamado:
    def __init__(self, banco: BancoMemoria, chat: ServicoChat) -> None:
        self.banco = banco
        self.chat = chat

    # ---------- Consultas ----------
    def listar(self, usuario: Usuario, status: str | None = None, solicitante: str | None = None) -> list[Chamado]:
        lista = self.banco.chamados_da_empresa(usuario.empresa_id)
        if status in STATUS_VALIDOS:
            lista = [c for c in lista if c.status == status]
        if usuario.perfil == COLABORADOR:
            # O colaborador só vê os próprios tickets
            lista = [c for c in lista if c.solicitante_id == usuario.id
                     or (c.solicitante_id is None and c.solicitante.lower() == usuario.nome.lower())]
        elif solicitante:
            alvo = solicitante.strip().lower()
            lista = [c for c in lista if c.solicitante.lower() == alvo]
        return lista

    def obter(self, usuario: Usuario, numero: int) -> Chamado:
        chamado = self.banco.chamados.get(numero)
        if chamado is None or self.banco.empresa_do_chamado(chamado) != usuario.empresa_id:
            raise NaoEncontrado(f"Chamado {codigo(numero)} não encontrado.")
        if usuario.perfil == COLABORADOR and chamado.solicitante_id not in (None, usuario.id):
            raise NaoEncontrado(f"Chamado {codigo(numero)} não encontrado.")
        return chamado

    # ---------- Colaborador ----------
    def abrir(self, usuario: Usuario, dados: dict) -> dict:
        chamado = Chamado.montar(self.banco.proximo("chamado"), dados, usuario.nome, usuario.id, usuario.empresa_id)
        self.banco.chamados[chamado.numero] = chamado
        if chamado.nivel == "alta":
            self.chat.avisar_grupo(usuario.empresa_id,
                                   f"Ticket {chamado.codigo} · {chamado.genero_titulo} chegou com prioridade ALTA. Quem pode assumir?",
                                   chamado.numero)
        return {"chamado": chamado.to_dict(), "mensagem": mensagem_confirmacao(chamado)}

    def ocultar(self, usuario: Usuario, numero: int) -> Chamado:
        """Tira o ticket da coluna "Histórico" da mesa; ele continua em Histórico de Tickets."""
        chamado = self.obter(usuario, numero)
        if chamado.status != RESOLVIDO:
            raise Conflito("Só tickets resolvidos podem sair do histórico.")
        chamado.oculto_mesa = True
        return chamado

    def excluir(self, usuario: Usuario, numero: int) -> dict:
        chamado = self.obter(usuario, numero)
        if usuario.perfil == GESTOR:                 # o gestor exclui em qualquer situação
            del self.banco.chamados[numero]
            return {"excluido": numero}
        dono = (chamado.solicitante_id == usuario.id if chamado.solicitante_id is not None
                else chamado.solicitante == usuario.nome)
        if usuario.perfil == COLABORADOR and not dono:
            raise AcessoNegado("Você só pode excluir os tickets que você abriu.")
        if chamado.status != AGUARDANDO:
            raise Conflito(f"O ticket {chamado.codigo} já está com {chamado.analista or 'um analista'} e não pode mais ser excluído.")
        del self.banco.chamados[numero]
        return {"excluido": numero}

    # ---------- Analista ----------
    def assumir(self, usuario: Usuario, numero: int) -> Chamado:
        chamado = self.obter(usuario, numero)
        if not usuario.eh_equipe:
            raise AcessoNegado("Só a equipe de TI assume tickets.")
        chamado.assumir(usuario.nome)
        if chamado.nivel == "alta":
            self.chat.avisar_grupo(usuario.empresa_id,
                                   f"{chamado.analista} assumiu o ticket {chamado.codigo} (prioridade ALTA).", chamado.numero)
        return chamado

    def resolver(self, usuario: Usuario, numero: int, nota: str) -> Chamado:
        chamado = self.obter(usuario, numero)
        if chamado.status == EM_ATENDIMENTO and usuario.perfil != GESTOR and usuario.nome != chamado.analista:
            raise AcessoNegado(f"Só {chamado.analista}, que assumiu o chamado, pode finalizá-lo.")
        chamado.resolver(nota)
        self.chat.encerrar_conversa(chamado, usuario.empresa_id)
        return chamado

    # ---------- Gestor ----------
    def atribuir(self, gestor: Usuario, numero: int, analista_id) -> Chamado:
        """Joga o ticket na mesa de um analista."""
        self._exigir_gestor(gestor)
        chamado = self.obter(gestor, numero)
        if chamado.status == RESOLVIDO:
            raise Conflito(f"O ticket {chamado.codigo} já foi resolvido.")
        try:
            analista = self.banco.usuarios.get(int(analista_id))
        except (TypeError, ValueError):
            analista = None
        if analista is None or analista.empresa_id != gestor.empresa_id or not analista.eh_equipe or not analista.ativo:
            raise NaoEncontrado("Analista não encontrado.")
        chamado.analista = analista.nome
        chamado.status = EM_ATENDIMENTO
        chamado.assumido_em = chamado.assumido_em or agora()
        self.chat.avisar_grupo(gestor.empresa_id,
                               f"{gestor.nome} passou o ticket {chamado.codigo} para a mesa de {analista.nome}.", chamado.numero)
        return chamado

    def mudar_prioridade(self, gestor: Usuario, numero: int, dados: dict) -> Chamado:
        """Troca a prioridade (baixa, normal, média ou alta)."""
        self._exigir_gestor(gestor)
        chamado = self.obter(gestor, numero)
        if "nivel" in dados:
            nivel = dados.get("nivel")
            if nivel not in catalogo.NIVEIS:
                raise DadosInvalidos("Escolha baixa, normal, média ou alta.")
            chamado.nivel_manual = nivel
            chamado.prioridade = catalogo.NIVEIS[nivel]
        return chamado

    @staticmethod
    def _exigir_gestor(usuario: Usuario) -> None:
        if usuario.perfil != GESTOR:
            raise AcessoNegado("Só o gestor pode fazer isso.")
