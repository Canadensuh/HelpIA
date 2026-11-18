"""Camada de Aplicação — contratação, login, sessão e contas da equipe.

A sessão é um token assinado (itsdangerous, que vem com o Flask) com o id
do usuário. O front manda o token no cabeçalho `Authorization: Bearer <token>`.
"""
from __future__ import annotations

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from backend.dominio.erros import AcessoNegado, Conflito, DadosInvalidos, NaoAutenticado, NaoEncontrado
from backend.dominio.usuario import (
    ANALISTA,
    COLABORADOR,
    GESTOR,
    PERFIS_CRIAVEIS,
    PLANOS,
    Empresa,
    Usuario,
    chave_email,
    validar_email,
    validar_nome,
    validar_plano,
    validar_senha,
)
from backend.persistencia.banco import BancoMemoria

VALIDADE_SESSAO = 12 * 60 * 60   # 12 horas, em segundos


class ServicoConta:
    def __init__(self, banco: BancoMemoria, chave_secreta: str) -> None:
        self.banco = banco
        self._assinador = URLSafeTimedSerializer(chave_secreta, salt="helpia-sessao")

    # ---------- Sessão ----------
    def emitir_sessao(self, usuario: Usuario) -> dict:
        return {"token": self._assinador.dumps({"uid": usuario.id}), "usuario": self.perfil_publico(usuario)}

    def perfil_publico(self, usuario: Usuario) -> dict:
        empresa = self.banco.empresas.get(usuario.empresa_id)
        return {**usuario.to_dict(), "empresa": empresa.to_dict() if empresa else None}

    def usuario_do_token(self, token: str) -> Usuario:
        try:
            dados = self._assinador.loads(token, max_age=VALIDADE_SESSAO)
        except SignatureExpired:
            raise NaoAutenticado("Sua sessão expirou. Entre novamente.")
        except BadSignature:
            raise NaoAutenticado("Sessão inválida. Entre novamente.")
        usuario = self.banco.usuarios.get(dados.get("uid"))
        if usuario is None:
            raise NaoAutenticado("Sessão inválida. Entre novamente.")
        if not usuario.ativo:
            raise NaoAutenticado("Sua conta foi suspensa pelo gestor.")
        return usuario

    # ---------- Login ----------
    def autenticar(self, email: str, senha: str, area: str | None = None) -> dict:
        usuario = self.banco.buscar_por_email(email)
        if usuario is None or not usuario.confere_senha(senha):
            raise NaoAutenticado("E-mail ou senha incorretos.")
        if not usuario.ativo:
            raise AcessoNegado("Esta conta está suspensa. Fale com o gestor da sua empresa.")
        if area and not usuario.entra_como(area):
            certa = "Colaborador" if usuario.perfil == COLABORADOR else "Analista"
            raise AcessoNegado(f"Esta conta não é de {area}. Selecione “{certa}” para entrar.")
        return self.emitir_sessao(usuario)

    def trocar_propria_senha(self, usuario: Usuario, atual: str, nova: str) -> None:
        if not usuario.confere_senha(atual):
            raise DadosInvalidos("A senha atual não confere.")
        usuario.definir_senha(validar_senha(nova))
        usuario.trocar_senha = False

    # ---------- Contratação ----------
    def contratar(self, plano: str, empresa: dict, responsavel: dict) -> dict:
        """Cria a empresa e a conta do gestor responsável, já logado."""
        plano = validar_plano(plano)
        nome_empresa = validar_nome(empresa.get("nome"), "Nome da empresa")
        # Valida o responsável antes de gravar, para não sobrar empresa sem gestor
        validar_nome(responsavel.get("nome"), "Nome do responsável")
        validar_email(responsavel.get("email"))
        validar_senha(responsavel.get("senha"))
        self._garantir_email_livre(responsavel.get("email"))
        nova = Empresa(id=self.banco.proximo("empresa"), nome=nome_empresa, plano=plano,
                       cnpj=str(empresa.get("cnpj") or "").strip()[:20])
        self.banco.empresas[nova.id] = nova
        gestor = self.criar_usuario(responsavel.get("nome"), responsavel.get("email"), GESTOR,
                                    nova.id, responsavel.get("senha"))
        return self.emitir_sessao(gestor)

    def criar_usuario(self, nome: str, email: str, perfil: str, empresa_id: int,
                      senha: str, criado_em: str | None = None) -> Usuario:
        usuario = Usuario.criar(self.banco.proximo("usuario"), nome, email, perfil, empresa_id, senha, criado_em)
        self.banco.usuarios[usuario.id] = usuario
        return usuario

    # ---------- Contas da equipe (só o gestor) ----------
    def criar_conta(self, gestor: Usuario, nome: str, email: str, perfil: str, senha: str,
                    criado_em: str | None = None) -> Usuario:
        self.exigir_gestor(gestor)
        if perfil not in PERFIS_CRIAVEIS:
            raise DadosInvalidos("O cargo deve ser analista, colaborador ou gestor.")
        self._garantir_email_livre(email)
        if perfil == ANALISTA:
            self._garantir_limite_analistas(gestor.empresa_id)
        return self.criar_usuario(nome, email, perfil, gestor.empresa_id, senha, criado_em)

    def listar_contas(self, gestor: Usuario) -> list[Usuario]:
        self.exigir_gestor(gestor)
        return self.banco.usuarios_da_empresa(gestor.empresa_id)

    def conta_da_empresa(self, gestor: Usuario, id_conta: int) -> Usuario:
        self.exigir_gestor(gestor)
        conta = self.banco.usuarios.get(id_conta)
        if conta is None or conta.empresa_id != gestor.empresa_id:
            raise NaoEncontrado("Conta não encontrada.")
        if conta.id == gestor.id:
            raise DadosInvalidos("Você não pode alterar a sua própria conta por aqui.")
        return conta

    def atualizar_conta(self, gestor: Usuario, id_conta: int, dados: dict) -> Usuario:
        """Suspender/reativar, trocar cargo, nome, e-mail ou pedir troca de senha."""
        conta = self.conta_da_empresa(gestor, id_conta)
        if "nome" in dados:
            conta.nome = validar_nome(dados["nome"])
        if "email" in dados and chave_email(dados["email"]) != chave_email(conta.email):
            self._garantir_email_livre(dados["email"])
            conta.email = validar_email(dados["email"])
        if "trocar_senha" in dados:
            conta.trocar_senha = bool(dados["trocar_senha"])
        perfil = dados.get("perfil")
        if perfil is not None and perfil != conta.perfil:
            if perfil not in PERFIS_CRIAVEIS:
                raise DadosInvalidos("O cargo deve ser analista, colaborador ou gestor.")
            if perfil == ANALISTA:
                self._garantir_limite_analistas(gestor.empresa_id)
            conta.perfil = perfil
        if "ativo" in dados:
            conta.ativo = bool(dados["ativo"])
        return conta

    def redefinir_senha(self, gestor: Usuario, id_conta: int, senha: str) -> Usuario:
        conta = self.conta_da_empresa(gestor, id_conta)
        conta.definir_senha(validar_senha(senha))
        conta.trocar_senha = False
        return conta

    # ---------- Regras auxiliares ----------
    @staticmethod
    def exigir_gestor(usuario: Usuario, mensagem: str = "Somente o gestor da empresa pode gerenciar contas.") -> None:
        if usuario.perfil != GESTOR:
            raise AcessoNegado(mensagem)

    def _garantir_email_livre(self, email: str) -> None:
        if self.banco.buscar_por_email(email):
            raise Conflito("Já existe uma conta com este e-mail.")

    def _garantir_limite_analistas(self, empresa_id: int) -> None:
        empresa = self.banco.empresas.get(empresa_id)
        limite = empresa.limite_analistas if empresa else None
        if limite is None:
            return
        analistas = sum(1 for u in self.banco.usuarios_da_empresa(empresa_id) if u.perfil == ANALISTA)
        if analistas >= limite:
            raise Conflito(f"O plano {PLANOS[empresa.plano]['nome']} permite até {limite} analistas.")
