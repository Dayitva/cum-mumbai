export const STABLECOINS = [
  {
    symbol: "USDC",
    name: "USD Coin",
    icon: "💵",
    decimals: 18,
    address: "0xE7d17BE1783079FD5A420165CdEdcBCCE2972251",
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    icon: "💲",
    decimals: 18,
    address: "0x6930aC79B79a778Bc59f81F83fa087Ff27553B99",
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    icon: "🪙",
    decimals: 18,
    address: "0xAAB44e159aF76b332E49416037081cbB8d016eD5",
  },
] as const

export type Stablecoin = (typeof STABLECOINS)[number]
