#!/usr/bin/env bash
# ============================================
# 拾绘 Inkglean · Docker 兜底安装脚本
# 适用场景：裸 Linux 服务器、还没装 Node.js（装不了 install.mjs）
# 用法：bash setup.sh
# 如果服务器已有 Node.js 22+，推荐改用：node install.mjs（功能更全）
# ============================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   拾绘 Inkglean · Docker 安装向导      ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

# ─── [1/4] 检测 Docker / Compose ───
echo -e "${YELLOW}[1/4] 检查运行环境...${NC}"

if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗ 未安装 Docker${NC}"
  echo "  请先安装 Docker（一条命令）："
  echo "  curl -fsSL https://get.docker.com | sh"
  exit 1
fi
echo -e "${GREEN}✓ Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)${NC}"

if docker compose version &> /dev/null; then
  COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
  COMPOSE="docker-compose"
else
  echo -e "${RED}✗ 未安装 Docker Compose${NC}"
  echo "  请安装 Compose 插件：sudo apt install docker-compose-plugin"
  exit 1
fi
echo -e "${GREEN}✓ $($COMPOSE version | head -1)${NC}"
echo ""

# ─── [2/4] 生成配置 ───
echo -e "${YELLOW}[2/4] 生成网站配置${NC}"

read -r -p "  你的网站要绑定域名吗？（没有就按回车，默认 localhost）： " DOMAIN
DOMAIN="${DOMAIN:-localhost}"

SESSION_SECRET=$(openssl rand -hex 32)
COOKIE_SECRET=$(openssl rand -hex 32)
# 安装口令（REQ-038）：保护未初始化系统的 /setup 向导，开箱第一步要输入
# 815 拍板 #3（方案 C）：32 位升 128 位，配合直达链接免手输；唯一用途 = 向导鉴权
SETUP_TOKEN=$(openssl rand -hex 16)
SETUP_TOKEN_IS_NEW=""

ENV_FILE=".env"
set_env_if_missing() {
  local key="$1" value="${2//&/\\&}"
  if grep -q "^${key}=." "$ENV_FILE" 2>/dev/null; then
    echo -e "  ${key} 已存在，跳过"
  elif grep -q "^${key}=$" "$ENV_FILE" 2>/dev/null; then
    # 清扫批（实测踩坑）：从 .env.example 复制来的空行（KEY=）会被旧逻辑误判为已配置，
    # 致密钥空着起不了服。空值就地填入（不追加新行，dotenv 以首行为准，追加会被空行赢过）
    sed -i "s|^${key}=$|${key}=${value}|" "$ENV_FILE"
    echo -e "  ${GREEN}${key} 原为空值，已自动填入${NC}"
  else
    [ -f "$ENV_FILE" ] || echo "# 拾绘 Inkglean 环境配置（由 setup.sh 自动生成）" > "$ENV_FILE"
    echo "${key}=${value}" >> "$ENV_FILE"
    echo -e "  ${GREEN}${key} 已写入${NC}"
  fi
}

set_env_if_missing "DOMAIN" "$DOMAIN"
set_env_if_missing "NODE_ENV" "production"
set_env_if_missing "SESSION_SECRET" "$SESSION_SECRET"
set_env_if_missing "COOKIE_SECRET" "$COOKIE_SECRET"
if ! grep -q "^SETUP_TOKEN=." "$ENV_FILE" 2>/dev/null; then
  SETUP_TOKEN_IS_NEW="yes"
fi
set_env_if_missing "SETUP_TOKEN" "$SETUP_TOKEN"

read -r -p "  你的 QQ 号（用于管理员账号，也可以按回车跳过）： " ADMIN_QQ
if [ -n "$ADMIN_QQ" ]; then
  set_env_if_missing "ADMIN_QQ" "$ADMIN_QQ"
fi
echo ""

# ─── [3/4] 构建并启动 ───
echo -e "${YELLOW}[3/4] 正在安装，请稍等（首次需要几分钟）...${NC}"
# 815 审计 P1-9 修复：先建挂载目录（对齐 install.mjs 同款防护）——
# 否则容器以 root 创建目录后宿主侧挂载可能因权限打不开库，首装崩溃循环
mkdir -p data uploads
$COMPOSE up -d --build

echo -e "${GREEN}✓ 打包完成，正在等待网站就绪${NC}"
echo -n "  "
HEALTHY=false
PROBE="fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1);return r.text()}).then(t=>{if(!t.includes('\"status\":\"ok\"'))process.exit(1)}).catch(()=>process.exit(1))"
for _ in $(seq 1 60); do
  sleep 2
  if $COMPOSE exec -T web node -e "$PROBE" &> /dev/null; then
    HEALTHY=true
    echo ""
    break
  fi
  echo -n "."
done
echo ""

if [ "$HEALTHY" != true ]; then
  echo -e "${RED}✗ 安装未成功：等待两分钟后网站仍没有响应${NC}"
  echo "  排查办法："
  echo "  1. $COMPOSE logs --tail 100 web"
  echo "  2. $COMPOSE ps"
  echo "  3. 修复后重新运行 bash setup.sh（已有配置不会丢）"
  exit 1
fi
echo -e "${GREEN}✓ 网站已就绪${NC}"
echo ""

# ─── [4/4] 完成 ───
echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║          安装完成！                    ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""
if [ "$DOMAIN" = "localhost" ]; then
  echo -e "  你的约稿网站已就绪：${GREEN}https://localhost${NC}"
else
  echo -e "  你的约稿网站已就绪：${GREEN}https://${DOMAIN}${NC}"
fi
echo ""
echo "  下一步："
echo "  1. 用浏览器打开上面的地址"
echo "  2. 跟随开箱设置向导，设置管理员账号"
echo "  3. 开始使用拾绘！"
echo ""
if [ -n "$SETUP_TOKEN_IS_NEW" ]; then
  echo -e "  ${YELLOW}安装口令：${SETUP_TOKEN}${NC}"
  echo -e "  ${YELLOW}（请妥善保管）${NC}"
  # 815 拍板 #3（方案 C）：直达链接免手输口令
  if [ "$DOMAIN" = "localhost" ]; then
    echo -e "  ${GREEN}直达链接：https://localhost/setup?token=${SETUP_TOKEN}${NC}"
  else
    echo -e "  ${GREEN}直达链接：https://${DOMAIN}/setup?token=${SETUP_TOKEN}${NC}"
  fi
  echo ""
fi
