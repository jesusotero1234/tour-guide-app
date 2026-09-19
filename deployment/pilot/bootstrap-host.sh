#!/usr/bin/env bash
# Base setup for the fresh Ubuntu 24.04 pilot host; run as root after package updates.
# This does not deploy the app, create cloud resources, or enable cloud backups.
set -Eeuo pipefail
trap 'printf "Host preparation failed at line %s\n" "$LINENO" >&2' ERR
[[ $EUID -eq 0 ]] || { printf 'Run as root.\n' >&2; exit 1; }
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || { printf 'Expected Ubuntu 24.04.\n' >&2; exit 1; }
[[ -s /root/.ssh/authorized_keys ]] || { printf 'Install and verify the SSH key first.\n' >&2; exit 1; }
for binary in ufw sshd fallocate mkswap swapon; do
    command -v "$binary" >/dev/null
 done

if ! id tour-pilot >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /srv/tour-guide --shell /usr/sbin/nologin tour-pilot
fi
install -d -o tour-pilot -g tour-pilot -m 0750 /srv/tour-guide
install -d -o root -g tour-pilot -m 0750 /etc/tour-guide

if [[ ! -e /swap-tour-guide ]]; then
    (umask 077; fallocate -l 2G /swap-tour-guide)
    mkswap /swap-tour-guide
fi
chmod 0600 /swap-tour-guide
if ! swapon --show=NAME --noheadings | grep -Fxq /swap-tour-guide; then
    swapon /swap-tour-guide
fi
if ! grep -Eq '^/swap-tour-guide[[:space:]]' /etc/fstab; then
    printf '/swap-tour-guide none swap sw 0 0\n' >> /etc/fstab
fi

# This file sorts before the cloud image's SSH defaults. Key login remains available.
cat > /etc/ssh/sshd_config.d/00-tour-guide.conf <<'SSH'
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSH
chmod 0644 /etc/ssh/sshd_config.d/00-tour-guide.conf
/usr/sbin/sshd -t
systemctl reload ssh

# Permit administration before enabling the firewall. All app origins stay private.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
cat > /etc/apt/apt.conf.d/52tour-guide-reboots <<'APT'
Unattended-Upgrade::Automatic-Reboot "false";
APT
systemctl enable --now apt-daily.timer apt-daily-upgrade.timer
/usr/sbin/sshd -T | grep -E '^(pubkeyauthentication|passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '
ufw status verbose
swapon --show
