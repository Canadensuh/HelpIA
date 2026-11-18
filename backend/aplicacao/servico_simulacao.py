"""Camada de Aplicação — dados de demonstração e o Modo simulação do gestor.

- popular_exemplos(): a empresa "HelpIA" com as contas de demonstração
  (senha de todas: 1234), tickets, conversas e metas — as mesmas do
  simulador do frontend (js/simulador.js).
- definir(): o gestor liga o Modo simulação (joga tickets fictícios na
  empresa) ou desliga (tira só o que a simulação criou).
- limpar(): Limpar dados — apaga todos os tickets e conversas da empresa
  (as contas e as metas ficam).
"""
from __future__ import annotations

from werkzeug.security import generate_password_hash

from backend.aplicacao.servico_chat import ServicoChat
from backend.aplicacao.servico_conta import ServicoConta
from backend.aplicacao.servico_metas import ServicoMetas
from backend.dominio.chamado import EM_ATENDIMENTO, RESOLVIDO, Chamado
from backend.dominio.chat import DIRETA, GRUPO, Conversa
from backend.dominio.erros import AcessoNegado
from backend.dominio.relogio import minutos_atras, momento
from backend.dominio.usuario import ANALISTA, COLABORADOR, GESTOR, Usuario
from backend.persistencia.banco import BancoMemoria

SENHA_DEMO = "1234"   # só nas contas de demonstração (contas novas: mínimo 6)
DEMO = {
    "murilo": {"nome": "Murilo do Nascimento B.", "email": "murilonb@helpia.com.br", "foto": "https://github.com/Canadensuh.png?size=200"},
    "joao_pm": {"nome": "João Pedro M.", "email": "joãopm@helpia.com.br", "foto": "https://github.com/marquess07.png?size=200"},
    "carlos": {"nome": "Carlos Souza", "email": "carlos@helpia.com.br"},
    "beatriz": {"nome": "Beatriz Rocha", "email": "beatriz@helpia.com.br"},
    "joao": {"nome": "João Silva", "email": "joao.silva@helpia.com.br"},
    "maria": {"nome": "Maria Oliveira", "email": "maria@helpia.com.br"},
}


class _PessoaExemplo:
    """Quem abre um ticket de exemplo quando a empresa ainda não tem colaboradores."""
    def __init__(self, nome: str) -> None:
        self.nome = nome
        self.id = None


class ServicoSimulacao:
    def __init__(self, banco: BancoMemoria, contas: ServicoConta, chat: ServicoChat, metas: ServicoMetas) -> None:
        self.banco = banco
        self.contas = contas
        self.chat = chat
        self.metas = metas

    # ---------- Dados de exemplo ----------
    def popular_exemplos(self) -> None:
        sessao = self.contas.contratar(
            "profissional", {"nome": "HelpIA", "cnpj": ""},
            {"nome": DEMO["murilo"]["nome"], "email": DEMO["murilo"]["email"], "senha": "provisoria"},
        )
        gestor = self.banco.usuarios[sessao["usuario"]["id"]]
        self._demo(gestor, foto=DEMO["murilo"]["foto"], criado_em=momento(45, 9, 0))

        def conta(chave: str, perfil: str, dias: int) -> Usuario:
            dados = DEMO[chave]
            usuario = self.contas.criar_conta(gestor, dados["nome"], dados["email"], perfil, "provisoria", momento(dias, 9, 0))
            return self._demo(usuario, foto=dados.get("foto"))

        conta("joao_pm", GESTOR, 45)
        carlos = conta("carlos", ANALISTA, 30)
        beatriz = conta("beatriz", ANALISTA, 21)
        joao = conta("joao", COLABORADOR, 20)
        conta("maria", COLABORADOR, 18)

        empresa = self.banco.empresas[gestor.empresa_id]
        empresa.simulacao = True
        criados = self.semear_chamados(empresa.id)
        self._semear_conversas(empresa.id, gestor, carlos, beatriz, joao, criados)

    @staticmethod
    def _demo(usuario: Usuario, foto: str | None = None, criado_em: str | None = None) -> Usuario:
        # A senha de demonstração (1234) é mais curta que o mínimo das contas novas: grava direto
        usuario.senha_hash = generate_password_hash(SENHA_DEMO)
        if foto:
            usuario.foto = foto
        if criado_em:
            usuario.criado_em = criado_em
        return usuario

    def semear_chamados(self, empresa_id: int) -> list[Chamado]:
        """Tickets fictícios da empresa (histórico + fila de hoje), marcados como simulados."""
        def da_empresa(perfil: str) -> list[Usuario]:
            return [u for u in self.banco.usuarios_da_empresa(empresa_id) if u.perfil == perfil and u.ativo]

        colabs = da_empresa(COLABORADOR)
        analistas = da_empresa(ANALISTA)
        joao = colabs[0] if colabs else _PessoaExemplo("João Silva")
        maria = colabs[1 % len(colabs)] if colabs else _PessoaExemplo("Maria Oliveira")
        carlos = analistas[0].nome if analistas else "Carlos Souza"
        beatriz = analistas[1 % len(analistas)].nome if analistas else "Beatriz Rocha"
        criados: list[Chamado] = []

        def chamado(pessoa, dados: dict, **extra) -> Chamado:
            c = Chamado.montar(self.banco.proximo("chamado"), dados, pessoa.nome, pessoa.id, empresa_id)
            c.simulado = True
            for chave, valor in extra.items():
                setattr(c, chave, valor)
            self.banco.chamados[c.numero] = c
            criados.append(c)
            return c

        def whats(numero: str) -> dict:
            return {"tipo": "whatsapp", "valor": numero}

        # Histórico (já resolvidos)
        chamado(joao, {"genero": "senha", "subgenero": "email", "impacto": "eu", "aberto_em": momento(2, 8, 40),
                       "nota": "Minha senha do e-mail expirou e não consigo trocar pela tela de login."},
                status=RESOLVIDO, analista=carlos, assumido_em=momento(2, 8, 52), resolvido_em=momento(2, 9, 5),
                resolucao="Senha expirada. Redefini no painel do Microsoft 365 e orientei sobre a troca a cada 90 dias.")
        chamado(maria, {"genero": "computador", "subgenero": "nao-liga", "impacto": "eu", "maquina": "043",
                        "aberto_em": momento(1, 9, 10), "contato": whats("(11) 98888-0043"),
                        "nota": "Cheguei e o computador não liga de jeito nenhum, nem a luz acende."},
                status=RESOLVIDO, analista=carlos, assumido_em=momento(1, 9, 18), resolvido_em=momento(1, 9, 40),
                resolucao="Cabo de força solto no estabilizador. Reconectei, liguei e testei: funcionando normalmente.")
        chamado(maria, {"genero": "internet", "subgenero": "cabo", "impacto": "eu", "maquina": "112", "aberto_em": momento(1, 14, 5),
                        "nota": "O computador mostra \"cabo de rede desconectado\" mesmo com o cabo ligado."},
                status=RESOLVIDO, analista=beatriz, assumido_em=momento(1, 14, 12), resolvido_em=momento(1, 14, 30),
                resolucao="Era só desconectar o cabo de rede e conectar novamente.")

        # Hoje
        chamado(joao, {"genero": "impressora", "subgenero": "atolado", "impacto": "equipe", "maquina": "IMP-2º andar",
                       "aberto_em": minutos_atras(55), "contato": whats("(11) 97777-1234"),
                       "nota": "A impressora do segundo andar travou com papel e ninguém da equipe consegue imprimir."},
                status=EM_ATENDIMENTO, analista=beatriz, assumido_em=minutos_atras(40))
        chamado(maria, {"genero": "computador", "subgenero": "nao-liga", "impacto": "eu", "maquina": "043",
                        "aberto_em": minutos_atras(18), "contato": whats("(11) 98888-0043"),
                        "nota": "O computador não ligou de novo hoje cedo. Mesma máquina de ontem."})
        chamado(joao, {"genero": "internet", "subgenero": "cabo", "impacto": "eu", "maquina": "087", "aberto_em": minutos_atras(9),
                       "nota": "Aparece um X no ícone de rede e o cabo parece estar conectado."})
        chamado(maria, {"genero": "setor", "subgenero": "sem-internet-setor", "impacto": "setor",
                        "aberto_em": minutos_atras(4), "contato": whats("(11) 96666-5555"),
                        "nota": "O financeiro inteiro ficou sem internet há uns 10 minutos. Urgente, fechamento do mês."})
        return criados

    def _semear_conversas(self, empresa_id: int, gestor: Usuario, carlos: Usuario, beatriz: Usuario,
                          joao: Usuario, criados: list[Chamado]) -> None:
        impressora, maquina_043, rede_087, setor = criados[3], criados[4], criados[5], criados[6]
        grupo = self.chat.grupo_da_empresa(empresa_id)

        def postar(conversa, autor, texto, ticket=None, minutos=0):
            self.chat.postar(conversa, autor.id if autor else None, texto, ticket.numero if ticket else None,
                             em=minutos_atras(minutos), simulado=True)

        postar(grupo, gestor, "Bom dia, time! Hoje o foco é zerar a bandeja antes do almoço. Bora?", minutos=70)
        postar(grupo, beatriz, "Peguei a impressora do 2º andar, a equipe toda está parada lá.", impressora, 41)
        postar(grupo, None, f"Ticket {setor.codigo} · Setor parado chegou com prioridade ALTA. Quem pode assumir?", setor, 4)
        postar(grupo, carlos, f"Deixa comigo o {setor.codigo} assim que eu fechar o que estou fazendo.", minutos=3)

        com_beatriz = Conversa(id=self.banco.proximo("conversa"), tipo=DIRETA, empresa_id=empresa_id,
                               membros=[carlos.id, beatriz.id])
        self.banco.conversas[com_beatriz.id] = com_beatriz
        postar(com_beatriz, beatriz, "Carlos, aquele computador 043 da Maria voltou a dar problema. Acho que é o estabilizador.",
               maquina_043, 15)

        com_joao = Conversa(id=self.banco.proximo("conversa"), tipo=DIRETA, empresa_id=empresa_id,
                            membros=[carlos.id, joao.id], ticket=rede_087.numero)
        self.banco.conversas[com_joao.id] = com_joao
        postar(com_joao, carlos, f"Oi João! Vi seu ticket {rede_087.codigo}. Enquanto eu não chego aí: "
                                 "o cabo de rede está bem encaixado atrás do computador?", rede_087, 6)

        metas = self.metas.da_empresa(empresa_id)
        metas.regra_do_dia = {"texto": "Prioridade ALTA primeiro, sempre. Ninguém fica mais de 30 minutos esperando na bandeja.",
                              "autor": gestor.nome, "em": minutos_atras(80)}
        for texto in ("Cada ticket fechado é alguém voltando a trabalhar. Obrigado, time!",
                      "Uma boa nota de resolução hoje economiza meia hora amanhã.",
                      "Respira, toma um café e bora pro próximo! ☕"):
            metas.motivacionais.append({"id": metas.proximo_motivacional, "texto": texto})
            metas.proximo_motivacional += 1

    # ---------- Modo simulação (gestor) ----------
    def estado(self, usuario: Usuario) -> dict:
        empresa = self.banco.empresas.get(usuario.empresa_id)
        return {"ativo": bool(empresa and empresa.simulacao)}

    def definir(self, gestor: Usuario, ativo) -> dict:
        if gestor.perfil != GESTOR:
            raise AcessoNegado("Só o gestor pode ligar o modo simulação.")
        empresa = self.banco.empresas[gestor.empresa_id]
        ativo = bool(ativo)
        if ativo and not empresa.simulacao:
            criados = self.semear_chamados(empresa.id)
            setor = criados[-1]
            self.chat.postar(self.chat.grupo_da_empresa(empresa.id), None,
                             f"Ticket {setor.codigo} · {setor.genero_titulo} chegou com prioridade ALTA. Quem pode assumir?",
                             setor.numero, simulado=True)
        if not ativo and empresa.simulacao:
            saem = {c.numero for c in self.banco.chamados.values()
                    if c.simulado and self.banco.empresa_do_chamado(c) == empresa.id}
            for numero in saem:
                del self.banco.chamados[numero]
            conversas = {c.id for c in self.banco.conversas.values() if c.empresa_id == empresa.id}
            self.banco.mensagens = [m for m in self.banco.mensagens
                                    if not (m.conversa_id in conversas and (m.simulado or m.ticket in saem))]
        empresa.simulacao = ativo
        return {"ativo": empresa.simulacao}

    def limpar(self, gestor: Usuario) -> dict:
        if gestor.perfil != GESTOR:
            raise AcessoNegado("Só o gestor pode limpar os dados.")
        empresa = self.banco.empresas[gestor.empresa_id]
        for numero in [c.numero for c in self.banco.chamados_da_empresa(empresa.id)]:
            del self.banco.chamados[numero]
        ids = {c.id for c in self.banco.conversas.values() if c.empresa_id == empresa.id}
        self.banco.mensagens = [m for m in self.banco.mensagens if m.conversa_id not in ids]
        for id_conversa in list(ids):
            if self.banco.conversas[id_conversa].tipo != GRUPO:
                del self.banco.conversas[id_conversa]
        for chave in [k for k in self.banco.leituras if k[0] in ids]:
            del self.banco.leituras[chave]
        empresa.simulacao = False
        return {"ativo": False, "limpo": True}
