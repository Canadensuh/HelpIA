"""Catálogo de abertura de chamados (o mesmo de frontend/js/catalogo.js).

Gênero (tipo de problema) → subgênero. Cada gênero define a categoria e a
fila do ticket; o gênero "setor" é sempre prioridade alta. O impacto
("eu", "equipe", "setor") e alguns subgêneros definem o nível de prioridade.

Se mudar o catálogo do frontend, mude aqui também (ids e títulos).
"""
from __future__ import annotations

CATALOGO = [
    {
        "id": "computador", "titulo": "Computador ou notebook",
        "categoria": "Hardware", "fila": "Suporte Técnico",
        "subgeneros": [
            ("nao-liga", "Não liga"), ("lento", "Lento ou travando"), ("tela", "Tela ou monitor"),
            ("perifericos", "Teclado ou mouse"), ("barulho", "Barulho ou esquentando"), ("outro", "Outro problema"),
        ],
    },
    {
        "id": "senha", "titulo": "Senha e acesso",
        "categoria": "Acesso", "fila": "Acessos e Identidade",
        "subgeneros": [
            ("email", "E-mail corporativo"), ("app-trabalho", "Aplicativo de trabalho"),
            ("sistema-empresa", "Sistema específico da empresa"), ("windows", "Login do Windows"),
            ("vpn", "VPN / acesso remoto"), ("bloqueada", "Conta bloqueada"),
        ],
    },
    {
        "id": "internet", "titulo": "Internet e rede",
        "categoria": "Rede", "fila": "Infraestrutura",
        "subgeneros": [
            ("sem-internet", "Estou sem internet"), ("lenta", "Internet lenta"), ("wifi", "Wi-Fi não conecta"),
            ("cabo", "Cabo de rede"), ("vpn", "VPN não conecta"), ("pasta-rede", "Pasta de rede"),
        ],
    },
    {
        "id": "setor", "titulo": "Setor parado",
        "categoria": "Incidente", "fila": "Infraestrutura", "prioridade": "Alta",
        "subgeneros": [
            ("energia", "Queda de energia"), ("sem-internet-setor", "Sem internet no setor"),
            ("sistema-fora", "Sistema principal fora do ar"), ("telefonia", "Telefonia parada"), ("outro", "Outro motivo"),
        ],
    },
    {
        "id": "impressora", "titulo": "Impressora",
        "categoria": "Hardware", "fila": "Suporte Técnico",
        "subgeneros": [
            ("nao-imprime", "Não imprime"), ("atolado", "Papel atolado"), ("toner", "Toner ou tinta"),
            ("falhas", "Impressão com falhas"), ("instalar", "Instalar impressora"),
        ],
    },
    {
        "id": "sistemas", "titulo": "Programas e sistemas",
        "categoria": "Software", "fila": "Sistemas",
        "subgeneros": [
            ("office", "Word, Excel ou PowerPoint"), ("outlook", "Outlook não abre"), ("teams", "Microsoft Teams"),
            ("instalar", "Instalar um programa"), ("erro-sistema", "Sistema da empresa com erro"), ("atualizacao", "Atualização"),
        ],
    },
    {
        "id": "pedido", "titulo": "Pedir equipamento",
        "categoria": "Solicitação", "fila": "Suporte Técnico",
        "subgeneros": [
            ("mouse-teclado", "Mouse e teclado"), ("mouse", "Mouse"), ("teclado", "Teclado"), ("notebook", "Notebook"),
            ("monitor", "Monitor adicional"), ("headset", "Headset"), ("cabos", "Cabos e adaptadores"), ("outro", "Outro equipamento"),
        ],
    },
    {
        "id": "outro", "titulo": "Outro assunto",
        "categoria": "Geral", "fila": "Service Desk",
        "subgeneros": [("duvida", "Tenho uma dúvida"), ("problema", "Tenho um problema"), ("sugestao", "Sugestão ou pedido")],
    },
]

IMPACTOS = ("eu", "equipe", "setor")
CONTATOS = ("whatsapp", "teams", "email")

NIVEIS = {
    "baixa": "Baixa",
    "normal": "Normal",
    "media": "Média",
    "alta": "Alta",
}

# Pedidos e dúvidas que não travam o trabalho de ninguém ("*" = o gênero inteiro)
SUBS_BAIXA = {
    "pedido": "*",
    "outro": ("duvida", "sugestao"),
    "impressora": ("toner", "instalar"),
    "sistemas": ("instalar", "atualizacao"),
}


def genero(id_genero: str) -> dict | None:
    return next((g for g in CATALOGO if g["id"] == id_genero), None)


def subgenero(id_genero: str, id_sub: str) -> tuple[str, str] | None:
    g = genero(id_genero)
    if not g:
        return None
    return next((s for s in g["subgeneros"] if s[0] == id_sub), None)


def nivel(genero_id: str | None, subgenero_id: str | None, impacto: str | None,
          prioridade: str | None = None, nivel_manual: str | None = None) -> str:
    """Nível de prioridade do ticket: 'baixa', 'normal', 'media' ou 'alta'.
    Mesma regra de Catalogo.nivel() do frontend."""
    if nivel_manual in NIVEIS:                       # o gestor trocou a prioridade
        return nivel_manual
    g = genero(genero_id or "")
    if (g and g.get("prioridade") == "Alta") or impacto == "setor":
        return "alta"
    if impacto == "equipe":
        return "media"
    if not impacto and prioridade == "Alta":
        return "alta"
    baixas = SUBS_BAIXA.get(genero_id or "")
    if baixas == "*" or (baixas and subgenero_id in baixas):
        return "baixa"
    return "normal"
