#!/usr/bin/env bash
# ==============================================================================
# AniDoki - Automated Production Deployment Script for Ubuntu VPS
# Website: anidoki.com
# ==============================================================================

set -euo pipefail

# Color formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${BLUE}${BOLD}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}${BOLD}[ERROR]${NC} $1" >&2
}

# ------------------------------------------------------------------------------
# 1. Check & Install Required Dependencies (Git, Docker, Docker Compose)
# ------------------------------------------------------------------------------
install_dependencies() {
  log_info "Kiểm tra và cài đặt các gói phụ thuộc trên Ubuntu..."

  # Sudo helper
  SUDO=""
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      SUDO="sudo"
    else
      log_error "Script yêu cầu quyền root hoặc lệnh sudo để cài đặt gói."
      exit 1
    fi
  fi

  # Cập nhật apt repository và cài đặt các công cụ cơ bản
  $SUDO apt-get update -y
  $SUDO apt-get install -y ca-certificates curl gnupg lsb-release git

  # Kiểm tra Git
  if ! command -v git &> /dev/null; then
    log_info "Đang cài đặt Git..."
    $SUDO apt-get install -y git
  fi

  # Kiểm tra Docker
  if ! command -v docker &> /dev/null; then
    log_info "Docker chưa được cài đặt. Đang tiến hành cài đặt Docker Engine chính thức..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    $SUDO sh /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh
    
    # Khởi chạy và kích hoạt Docker service
    $SUDO systemctl enable --now docker
    
    # Thêm user hiện tại vào docker group nếu không phải root
    if [ "$(id -u)" -ne 0 ]; then
      $SUDO usermod -aG docker "$USER" || true
      log_warn "Đã thêm $USER vào nhóm docker. Bạn có thể cần đăng nhập lại để sử dụng docker không cần sudo."
    fi
  else
    log_success "Docker đã sẵn sàng: $(docker --version)"
  fi

  # Kiểm tra Docker Compose plugin (docker compose)
  if ! docker compose version &> /dev/null; then
    log_info "Đang cài đặt Docker Compose Plugin..."
    $SUDO apt-get install -y docker-compose-plugin
  else
    log_success "Docker Compose đã sẵn sàng: $(docker compose version)"
  fi
}

# ------------------------------------------------------------------------------
# 2. Setup Environment Files (.env)
# ------------------------------------------------------------------------------
setup_env() {
  if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
      log_warn "Không tìm thấy file .env, tiến hành sao chép từ .env.example..."
      cp .env.example .env
      log_warn "Vui lòng kiểm tra và chỉnh sửa cấu hình bảo mật trong file .env trước khi chạy production."
    else
      log_warn "Không tìm thấy .env hoặc .env.example. Vui lòng đảm bảo các biến môi trường cần thiết đã được cung cấp."
    fi
  else
    log_success "File môi trường .env đã tồn tại."
  fi
}

# ------------------------------------------------------------------------------
# 3. Pull Latest Source Code from Git
# ------------------------------------------------------------------------------
pull_latest_code() {
  if [ -d ".git" ]; then
    log_info "Đang kéo mã nguồn mới nhất từ Git repository..."
    BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
    
    # Kéo code từ remote
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
    log_success "Đã cập nhật mã nguồn mới nhất (nhánh: $BRANCH)."
  else
    log_warn "Thư mục hiện tại không phải Git repository, bỏ qua bước git pull."
  fi
}

# ------------------------------------------------------------------------------
# 4. Rebuild & Launch Containers with Docker Compose
# ------------------------------------------------------------------------------
deploy_containers() {
  log_info "Đang rebuild và khởi động các container với Docker Compose..."
  docker compose pull || true
  docker compose up -d --build --remove-orphans
  log_success "Các container đã được khởi chạy ngầm thành công."
}

# ------------------------------------------------------------------------------
# 5. Clean up old/dangling Docker artifacts
# ------------------------------------------------------------------------------
cleanup_docker() {
  log_info "Dọn dẹp các Docker image và container rác cũ..."
  docker system prune -f
  log_success "Đã dọn dẹp tài nguyên rác."
}

# ------------------------------------------------------------------------------
# 6. Print Status & Instructions
# ------------------------------------------------------------------------------
print_status() {
  echo ""
  echo -e "${CYAN}${BOLD}==================================================================${NC}"
  echo -e "${CYAN}${BOLD}           TRẠNG THÁI CÁC DỊCH VỤ ANIDOKI (DOCKER COMPOSE)        ${NC}"
  echo -e "${CYAN}${BOLD}==================================================================${NC}"
  docker compose ps
  echo ""
  log_success "Quá trình triển khai AniDoki hoàn tất!"
  echo -e "Website: ${BOLD}https://anidoki.com${NC}"
  echo ""
}

# ------------------------------------------------------------------------------
# Main Execution Flow
# ------------------------------------------------------------------------------
main() {
  echo -e "${CYAN}${BOLD}"
  echo "  █████  ███    ██ ██ ██████   ██████  ██   ██ ██ "
  echo " ██   ██ ████   ██ ██ ██   ██ ██    ██ ██  ██  ██ "
  echo " ███████ ██ ██  ██ ██ ██   ██ ██    ██ █████   ██ "
  echo " ██   ██ ██  ██ ██ ██ ██   ██ ██    ██ ██  ██  ██ "
  echo " ██   ██ ██   ████ ██ ██████   ██████  ██   ██ ██ "
  echo -e "          Auto Deployment Script for anidoki.com${NC}\n"

  install_dependencies
  setup_env
  pull_latest_code
  deploy_containers
  cleanup_docker
  print_status
}

main "$@"
