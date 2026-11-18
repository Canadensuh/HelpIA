"""Camada de Aplicação — HelpIA Chat.

Grupo da equipe, conversas diretas, respostas, avisos automáticos do
HelpIA, /clear do gestor e encerramento da conversa com o colaborador
quando o ticket é carimbado.
"""
from __future__ import annotations

from backend.dominio.chamado import RESOLVIDO, Chamado, codigo
from backend.dominio.chat import DIRETA, GRUPO, Conversa, Mensagem
from backend.dominio.erros import AcessoNegado, Conflito, DadosInvalidos, NaoEncontrado
from backend.dominio.relogio import agora
from backend.dominio.usuario import ANALISTA, COLABORADOR, GESTOR, Usuario
from backend.persistencia.banco import BancoMemoria


def _inteiro(valor) -> int:
    try:
        return max(0, int(valor or 0))
    except (TypeError, ValueError):
        return 0


class ServicoChat:
    def __init__(self, banco: BancoMemoria) -> None:
        self.banco = banco

    # ---------- Conversas ----------
    def grupo_da_empresa(self, empresa_id: int) -> Conversa:
        grupo = next((c for c in self.banco.conversas.values()
                      if c.tipo == GRUPO and c.empresa_id == empresa_id), None)
        if grupo is None:
            empresa = self.banco.empresas.get(empresa_id)
            grupo = Conversa(id=self.banco.proximo("conversa"), tipo=GRUPO, empresa_id=empresa_id,
                             nome=f"Equipe {empresa.nome if empresa else 'HelpIA'}")
            self.banco.conversas[grupo.id] = grupo
        return grupo

    def participantes(self, conversa: Conversa) -> list[Usuario]:
        if conversa.tipo == GRUPO:
            return [u for u in self.banco.usuarios_da_empresa(conversa.empresa_id) if u.eh_equipe and u.ativo]
        return [self.banco.usuarios[i] for i in conversa.membros if i in self.banco.usuarios]

    @staticmethod
    def pode_ver(usuario: Usuario, conversa: Conversa) -> bool:
        if conversa.tipo == GRUPO:
            return usuario.eh_equipe and usuario.empresa_id == conversa.empresa_id
        return usuario.id in conversa.membros

    def conversa_do_usuario(self, usuario: Usuario, id_conversa: int) -> Conversa:
        conversa = self.banco.conversas.get(id_conversa)
        if conversa is None or not self.pode_ver(usuario, conversa):
            raise NaoEncontrado("Conversa não encontrada.")
        return conversa

    def postar(self, conversa: Conversa, autor_id: int | None, texto: str, ticket: int | None = None,
               em: str | None = None, anexos: list | None = None, simulado: bool = False) -> Mensagem:
        mensagem = Mensagem(id=self.banco.proximo("mensagem"), conversa_id=conversa.id, autor_id=autor_id,
                            texto=texto, ticket=ticket, em=em or agora(), anexos=anexos or [], simulado=simulado)
        self.banco.mensagens.append(mensagem)
        if autor_id:
            self.banco.leituras[(conversa.id, autor_id)] = mensagem.id     # quem escreve já leu
        return mensagem

    def avisar_grupo(self, empresa_id: int | None, texto: str, ticket: int | None = None) -> None:
        """Aviso automático do HelpIA no grupo da equipe, mencionando o ticket."""
        if empresa_id:
            self.postar(self.grupo_da_empresa(empresa_id), None, texto, ticket)

    def abrir_direta(self, usuario: Usuario, outro_id: int, ticket: int | None = None) -> Conversa:
        outro = self.banco.usuarios.get(outro_id)
        if outro is None or outro.empresa_id != usuario.empresa_id or outro.id == usuario.id:
            raise NaoEncontrado("Pessoa não encontrada.")
        if not usuario.eh_equipe:
            raise AcessoNegado("Colaboradores respondem às mensagens dos analistas, mas não iniciam conversas.")
        conversa = next((c for c in self.banco.conversas.values() if c.tipo == DIRETA
                         and usuario.id in c.membros and outro.id in c.membros), None)
        if outro.perfil == COLABORADOR:
            # Com o colaborador, a conversa é sobre um ticket em aberto dele
            aberto = next((c for c in self.banco.chamados.values() if c.solicitante_id == outro.id
                           and c.status != RESOLVIDO and (not ticket or c.numero == ticket)), None)
            if aberto is None and (conversa is None or conversa.encerrada):
                raise Conflito(f"{outro.nome} não tem ticket em aberto. A conversa volta quando houver um novo chamado.")
            if conversa is not None and conversa.encerrada and aberto is not None:
                conversa.encerrada = False
                conversa.ticket = aberto.numero
            if not ticket and aberto is not None:
                ticket = aberto.numero
        if conversa is None:
            conversa = Conversa(id=self.banco.proximo("conversa"), tipo=DIRETA, empresa_id=usuario.empresa_id,
                                membros=[usuario.id, outro.id])
            self.banco.conversas[conversa.id] = conversa
        if ticket:
            conversa.ticket = ticket
        return conversa

    def encerrar_conversa(self, chamado: Chamado, empresa_id: int | None) -> None:
        """Ticket carimbado: encerra a conversa direta do analista com o colaborador
        (a não ser que ainda haja outro ticket dele em aberto com o mesmo analista)."""
        analista = self.banco.usuario_por_nome(chamado.analista, empresa_id)
        if analista is None or chamado.solicitante_id is None:
            return
        conversa = next((c for c in self.banco.conversas.values() if c.tipo == DIRETA
                         and analista.id in c.membros and chamado.solicitante_id in c.membros), None)
        if conversa is None or conversa.encerrada:
            return
        outro_aberto = any(c.solicitante_id == chamado.solicitante_id and c.status != RESOLVIDO
                           and c.analista == analista.nome for c in self.banco.chamados.values())
        complemento = ("A conversa continua pelos outros tickets em aberto." if outro_aberto
                       else "Conversa encerrada: ela volta se um novo chamado for aberto.")
        self.postar(conversa, None, f"Ticket {chamado.codigo} carimbado por {analista.nome}. {complemento}", chamado.numero)
        if not outro_aberto:
            conversa.encerrada = True

    # ---------- Saída para o front ----------
    def resposta_dict(self, id_mensagem: int) -> dict:
        original = next((m for m in self.banco.mensagens if m.id == id_mensagem), None)
        if original is None:
            return {"id": id_mensagem, "apagada": True}
        autor = self.banco.usuarios.get(original.autor_id) if original.autor_id else None
        return {
            "id": id_mensagem, "autor_id": original.autor_id,
            "autor_nome": autor.nome if autor else "HelpIA", "autor_perfil": autor.perfil if autor else "sistema",
            "texto": str(original.texto or ("📎 Anexo" if original.anexos else ""))[:140],
        }

    def mensagem_dict(self, m: Mensagem) -> dict:
        autor = self.banco.usuarios.get(m.autor_id) if m.autor_id else None
        ticket = self.banco.chamados.get(m.ticket) if m.ticket else None
        return {
            "id": m.id, "conversa_id": m.conversa_id, "texto": m.texto, "em": m.em, "anexos": m.anexos,
            "sistema": not m.autor_id,
            "autor_id": m.autor_id, "autor_nome": autor.nome if autor else "HelpIA",
            "autor_perfil": autor.perfil if autor else "sistema", "autor_foto": autor.foto if autor else None,
            "ticket": ticket.to_dict() if ticket else None,
            "resposta": self.resposta_dict(m.resposta) if m.resposta else None,
        }

    def conversa_dict(self, conversa: Conversa, usuario: Usuario) -> dict:
        mensagens = self.banco.mensagens_da_conversa(conversa.id)
        lida = self.banco.leituras.get((conversa.id, usuario.id), 0)
        pessoas = self.participantes(conversa)
        outro = next((u for u in pessoas if u.id != usuario.id), None) if conversa.tipo == DIRETA else None
        ultima = mensagens[-1] if mensagens else None
        ticket = None
        if conversa.ticket:
            achado = self.banco.chamados.get(conversa.ticket)
            ticket = achado.to_dict() if achado else {"numero": conversa.ticket, "codigo": codigo(conversa.ticket)}
        return {
            "id": conversa.id, "tipo": conversa.tipo,
            "nome": conversa.nome if conversa.tipo == GRUPO else (outro.nome if outro else "Conversa"),
            "outro": outro.to_dict() if outro else None,
            "participantes": [u.resumo() for u in pessoas],
            "ticket": ticket,
            "ultima": self.mensagem_dict(ultima) if ultima else None,
            "encerrada": conversa.encerrada,
            "atividade": ultima.em if ultima else conversa.criada_em,
            "nao_lidas": sum(1 for m in mensagens if m.id > lida and m.autor_id != usuario.id),
        }

    # ---------- Ações das rotas ----------
    def listar_conversas(self, usuario: Usuario) -> list[dict]:
        if usuario.eh_equipe:
            self.grupo_da_empresa(usuario.empresa_id)
        lista = [self.conversa_dict(c, usuario) for c in list(self.banco.conversas.values())
                 if c.empresa_id == usuario.empresa_id and self.pode_ver(usuario, c)]
        lista = [c for c in lista if c["tipo"] == GRUPO or c["ultima"] or usuario.eh_equipe]
        return sorted(lista, key=lambda c: c["atividade"], reverse=True)

    def nao_lidas(self, usuario: Usuario) -> int:
        return sum(self.conversa_dict(c, usuario)["nao_lidas"] for c in list(self.banco.conversas.values())
                   if c.empresa_id == usuario.empresa_id and self.pode_ver(usuario, c))

    def contatos(self, usuario: Usuario) -> list[dict]:
        if not usuario.eh_equipe:
            return []
        alvo = (ANALISTA, GESTOR) if usuario.perfil == GESTOR else (ANALISTA, GESTOR, COLABORADOR)
        pessoas = [u for u in self.banco.usuarios_da_empresa(usuario.empresa_id)
                   if u.id != usuario.id and u.ativo and u.perfil in alvo]
        return [u.to_dict() for u in sorted(pessoas, key=lambda u: u.nome)]

    def mensagens(self, usuario: Usuario, id_conversa: int) -> list[dict]:
        conversa = self.conversa_do_usuario(usuario, id_conversa)
        return [self.mensagem_dict(m) for m in self.banco.mensagens_da_conversa(conversa.id)]

    def enviar(self, usuario: Usuario, id_conversa: int, dados: dict) -> dict:
        conversa = self.conversa_do_usuario(usuario, id_conversa)
        texto = str(dados.get("texto") or "").strip()
        # Anexos: só os dados do arquivo; o arquivo em si foi enviado antes para /api/anexos
        anexos = []
        for a in (dados.get("anexos") or [])[:10]:
            if not isinstance(a, dict) or not str(a.get("id") or ""):
                continue
            anexos.append({
                "id": str(a.get("id"))[:40], "nome": str(a.get("nome") or "arquivo")[:200],
                "tipo": str(a.get("tipo") or "application/octet-stream")[:100], "tamanho": _inteiro(a.get("tamanho")),
            })
        if conversa.encerrada:
            raise Conflito("Esta conversa foi encerrada quando o ticket foi carimbado.")
        if not texto and not anexos:
            raise DadosInvalidos("Escreva uma mensagem ou anexe um arquivo.")
        ticket = int(dados["ticket"]) if dados.get("ticket") else None
        if ticket and ticket not in self.banco.chamados:
            raise DadosInvalidos("Ticket não encontrado.")
        nova = self.postar(conversa, usuario.id, texto[:1000], ticket, anexos=anexos)
        resposta = int(dados["resposta"]) if dados.get("resposta") else None
        if resposta and any(m.id == resposta and m.conversa_id == conversa.id for m in self.banco.mensagens):
            nova.resposta = resposta
        return self.mensagem_dict(nova)

    def marcar_lida(self, usuario: Usuario, id_conversa: int) -> None:
        conversa = self.conversa_do_usuario(usuario, id_conversa)
        mensagens = self.banco.mensagens_da_conversa(conversa.id)
        if mensagens:
            self.banco.leituras[(conversa.id, usuario.id)] = mensagens[-1].id

    def limpar(self, usuario: Usuario, id_conversa: int) -> None:
        """Comando /clear: só o gestor limpa a conversa."""
        if usuario.perfil != GESTOR:
            raise AcessoNegado("Só o gestor pode limpar a conversa (/clear).")
        conversa = self.conversa_do_usuario(usuario, id_conversa)
        self.banco.mensagens = [m for m in self.banco.mensagens if m.conversa_id != conversa.id]
        self.postar(conversa, None, f"{usuario.nome} limpou a conversa.")

    def atualizar(self, usuario: Usuario, id_conversa: int, dados: dict) -> dict:
        """Hoje só tira (ou troca) o "ticket do assunto"."""
        conversa = self.conversa_do_usuario(usuario, id_conversa)
        if "ticket" in dados:
            conversa.ticket = int(dados["ticket"]) if dados["ticket"] else None
        return self.conversa_dict(conversa, usuario)
