# Run from an elevated Windows PowerShell. WSL must use networkingMode=mirrored.
param(
    [string]$Subnet = '192.168.8.0/24',
    [switch]$Remove,
    [string]$VpnClientIp,
    [string]$VpnSubnet
)
$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Abre PowerShell como administrador para cambiar estas dos reglas de red.'
}
$rule = 'TourGuidePreview3100'
$hyperVRule = 'TourGuidePreview3100WSL'
$vm = '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
$hyperVRules = @(
    foreach ($name in @($hyperVRule, $rule)) {
        Get-NetFirewallHyperVRule -Name $name -ErrorAction SilentlyContinue |
            Where-Object { $_.PolicyStoreSourceType -ne 'HostFirewallLocal' }
    }
)
if ($Remove) {
    $hyperVRules | Remove-NetFirewallHyperVRule
    Remove-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue
    Write-Output 'Reglas del puerto 3100 eliminadas.'
    exit
}
$remoteAddresses = @($Subnet)
if ($VpnSubnet) { $remoteAddresses += $VpnSubnet }
foreach ($network in $remoteAddresses) {
    if ($network -notmatch '^(10\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3})\.0/24$') {
        throw 'Indica una subred privada /24, por ejemplo 192.168.8.0/24 o 10.0.0.0/24.'
    }
    foreach ($octet in $network.Split('/')[0].Split('.')) {
        if ([int]$octet -gt 255) { throw 'Subred IPv4 no valida.' }
    }
}
if ($VpnClientIp) {
    if ($VpnClientIp -notmatch '^(10\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3})\.\d{1,3}$') {
        throw 'Indica la IPv4 privada del cliente VPN sin mascara, por ejemplo 10.0.0.2.'
    }
    foreach ($octet in $VpnClientIp.Split('.')) {
        if ([int]$octet -gt 255) { throw 'IPv4 del cliente VPN no valida.' }
    }
    $remoteAddresses += $VpnClientIp
}
if ($hyperVRules.Count) {
    $hyperVRules | Set-NetFirewallHyperVRule -RemoteAddresses $remoteAddresses -Enabled True -Action Allow | Out-Null
} else {
    # Create a native WSL rule even when Windows already exposes a mirrored rule.
    New-NetFirewallHyperVRule -Name $hyperVRule -DisplayName 'Tour Guide local preview 3100 - WSL' -Direction Inbound -VMCreatorId $vm -Protocol TCP -LocalPorts 3100 -RemoteAddresses $remoteAddresses -Action Allow | Out-Null
}
if (Get-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue) {
    Get-NetFirewallRule -Name $rule | Get-NetFirewallAddressFilter | Set-NetFirewallAddressFilter -RemoteAddress $remoteAddresses | Out-Null
    Set-NetFirewallRule -Name $rule -Enabled True -Action Allow | Out-Null
} else {
    New-NetFirewallRule -Name $rule -DisplayName 'Tour Guide local preview 3100' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3100 -RemoteAddress $remoteAddresses -Profile Any | Out-Null
}
Write-Output "Puerto 3100 permitido desde $($remoteAddresses -join ', '). No se han abierto otros puertos."
