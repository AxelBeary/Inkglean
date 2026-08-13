#!/usr/bin/env bash
# ============================================
# 绘约 开箱设置脚本（REQ-038 / 组件 A）
# 用法：bash setup.sh
# 从一台新服务器开始，一条命令完成环境检测 → 配置 → 启动
# ============================================
set -euo pipefail

# ─── 颜色 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    绘约 · 开箱设置向导              ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""

# ─── 步骤 1：检测 Docker / Compose ───
echo -e "${YELLOW}[1/7] 检测运行环境...${NC}"

if ! command -v docker &> /dev/null; then
  echo -e "${RED}✗ 未安装 Docker${NC}"
  echo "  请先安装 Docker："
  echo "  curl -fsSL https://get.docker.com | sh"
  exit 1
fi
echo -e "${GREEN}✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')${NC}"

# 检查 docker compose 插件
if docker compose version &> /dev/null; then
  DOCKER_COMPOSE="docker compose"
elif docker-compose --version &> /dev/null; then
  DOCKER_COMPOSE="docker-compose"
else
  echo -e "${RED}✗ 未安装 Docker Compose${NC}"
  echo "  请安装 Docker Compose 插件："
  echo "  sudo apt install docker-compose-plugin"
  exit 1
fi
echo -e "${GREEN}✓ $($DOCKER_COMPOSE version)${NC}"

# ─── 步骤 2：安装口令开关 ───
echo ""
echo -e "${YELLOW}[2/7] 安装口令设置${NC}"
echo -e "  安装口令用于防止未授权访问 /setup 设置页"
echo -e "  不知道这是什么？直接回车使用默认值（推荐）"
echo ""
read -r -p "  是否生成安装口令？[Y/n] " setup_token_choice
setup_token_choice="${setup_token_choice:-Y}"

SETUP_TOKEN=""
if [[ "$setup_token_choice" =~ ^[Yy]?$ ]]; then
  # 生成随机 8 字符字母数字口令
  SETUP_TOKEN=$(openssl rand -hex 4)
  echo -e "${GREEN}  ✓ 安装口令已生成（稍后显示）${NC}"
else
  echo -e "${YELLOW}  ⚠ 未设置安装口令，/setup 页面无需验证即可访问${NC}"
fi

# ─── 步骤 3：生成 SESSION_SECRET / COOKIE_SECRET ───
echo ""
echo -e "${YELLOW}[3/7] 生成安全密钥...${NC}"

SESSION_SECRET=$(openssl rand -hex 32)
COOKIE_SECRET=$(openssl rand -hex 32)
echo -e "${GREEN}  ✓ SESSION_SECRET 已生成${NC}"
echo -e "${GREEN}  ✓ COOKIE_SECRET 已生成${NC}"

# ─── 步骤 4：询问域名 ───
echo ""
echo -e "${YELLOW}[4/7] 域名配置${NC}"
echo -e "  请输入你的域名（如 example.com）"
echo -e "  没有域名可先用服务器 IP 地址（后续可改）"
echo ""
read -r -p "  域名或 IP： " DOMAIN
while [[ -z "$DOMAIN" ]]; do
  echo -e "${RED}  域名不能为空${NC}"
  read -r -p "  域名或 IP： " DOMAIN
done
echo -e "${GREEN}  ✓ 域名：$DOMAIN${NC}"

# ─── 步骤 5：写 .env ───
echo ""
echo -e "${YELLOW}[5/7] 写入配置文件...${NC}"

ENV_FILE=".env"
ENV_EXISTS=false
if [ -f "$ENV_FILE" ]; then
  ENV_EXISTS=true
  echo -e "${YELLOW}  ⚠ 检测到已有 .env 文件，将只补充缺失的配置项${NC}"
fi

# 只补缺失，不覆盖已有值
function set_env_if_missing() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    echo -e "  ${YELLOW}  ${key} 已存在，跳过${NC}"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
    echo -e "  ${GREEN}  ${key} 已写入${NC}"
  fi
}

if [ "$ENV_EXISTS" = false ]; then
  # 全新 .env
  cat > "$ENV_FILE" << EOF
# 绘约 环境配置（由 setup.sh 自动生成）
DOMAIN=${DOMAIN}
NODE_ENV=production
SESSION_SECRET=${SESSION_SECRET}
COOKIE_SECRET=${COOKIE_SECRET}
EOF
  # 追加 SETUP_TOKEN（如有）
  if [ -n "$SETUP_TOKEN" ]; then
    echo "SETUP_TOKEN=${SETUP_TOKEN}" >> "$ENV_FILE"
  fi
  echo -e "${GREEN}  ✓ .env 文件已创建${NC}"
else
  # 已有 .env，逐项补缺
  set_env_if_missing "DOMAIN" "$DOMAIN"
  set_env_if_missing "NODE_ENV" "production"
  set_env_if_missing "SESSION_SECRET" "$SESSION_SECRET"
  set_env_if_missing "COOKIE_SECRET" "$COOKIE_SECRET"
  if [ -n "$SETUP_TOKEN" ]; then
    set_env_if_missing "SETUP_TOKEN" "$SETUP_TOKEN"
  fi
  echo -e "${GREEN}  ✓ .env 文件已更新${NC}"
fi

# ─── 步骤 6：启动容器 ───
echo ""
echo -e "${YELLOW}[6/7] 启动服务...${NC}"

$DOCKER_COMPOSE up -d --build

echo -e "${GREEN}  ✓ 容器已启动，等待健康检查...${NC}"

# 等待健康（最长 120 秒）：以 /api/health 响应首行为准，不再只看进程/状态列。
# 超时即 exit 1（P0-5：杜绝「超时仍打印开箱设置完成并退出 0」的假成功）。
HEALTHY=false
echo -n "  "
for i in $(seq 1 60); do
  sleep 2
  HEALTH_LINE=""
  HEALTH_LINE=$($DOCKER_COMPOSE exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1);return r.text()}).then(t=>{console.log(t.split('\n')[0])}).catch(()=>process.exit(1))" 2>/dev/null) || HEALTH_LINE=""
  if [ -n "$HEALTH_LINE" ] && printf '%s' "$HEALTH_LINE" | grep -q '"status":"ok"'; then
    HEALTHY=true
    echo -e "${GREEN}✓ 服务已就绪！${NC}"
    echo -e "${GREEN}   health: ${HEALTH_LINE}${NC}"
    break
  fi
  echo -n "."
done
echo ""
if [ "$HEALTHY" != true ]; then
  echo -e "${RED}✗ 安装未成功：健康检查超时（120 秒），服务未就绪${NC}"
  echo ""
  echo "  下一步排查："
  echo "  1. $DOCKER_COMPOSE logs --tail 200 web"
  echo "  2. $DOCKER_COMPOSE ps"
  echo "  3. 修复后重新运行 bash setup.sh（已有 .env 配置不会丢失）"
  exit 1
fi

# ─── 步骤 7：打印完成信息 ───
echo ""
echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  开箱设置完成！                       ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "  访问地址：${GREEN}https://${DOMAIN}${NC}"
echo ""

if [ -n "$SETUP_TOKEN" ]; then
  echo -e "  ${YELLOW}安装口令：${SETUP_TOKEN}${NC}"
  echo -e "  ${YELLOW}（请妥善保管，设置向导第一步需要输入）${NC}"
  echo ""
fi

echo -e "  下一步："
echo -e "  1. 浏览器打开上面的地址"
echo -e "  2. 跟随开箱设置向导完成管理员绑定"
echo -e "  3. 开始使用绘约！"
echo ""
echo -e "  ${YELLOW}提示：${NC}SESSION_SECRET 和 COOKIE_SECRET 已自动生成，"
echo -e "  请勿泄露。如需查看，请检查 .env 文件。"
echo ""
