// Swap contract address on Base
export const SWAP_CONTRACT_ADDRESS = "0x74b806A3f6Da4bEE91e831301ebA504e7189F6BD" as const

// Swap contract ABI
export const swapAbi = [
  {
    inputs: [
      {
        internalType: "contract IAqua",
        name: "aqua",
        type: "address"
      }
    ],
    stateMutability: "nonpayable",
    type: "constructor"
  },
  {
    inputs: [],
    name: "AQUA",
    outputs: [
      {
        internalType: "contract IAqua",
        name: "",
        type: "address"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "contract XYCSwap",
        name: "app",
        type: "address"
      },
      {
        components: [
          {
            internalType: "address",
            name: "maker",
            type: "address"
          },
          {
            internalType: "address",
            name: "token0",
            type: "address"
          },
          {
            internalType: "address",
            name: "token1",
            type: "address"
          },
          {
            internalType: "uint256",
            name: "feeBps",
            type: "uint256"
          },
          {
            internalType: "bytes32",
            name: "salt",
            type: "bytes32"
          }
        ],
        internalType: "struct XYCSwap.Strategy",
        name: "strategy",
        type: "tuple"
      },
      {
        internalType: "bool",
        name: "zeroForOne",
        type: "bool"
      },
      {
        internalType: "uint256",
        name: "amountIn",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "amountOutMin",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "recipient",
        type: "address"
      }
    ],
    name: "swapExactIn",
    outputs: [
      {
        internalType: "uint256",
        name: "amountOut",
        type: "uint256"
      }
    ],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      {
        internalType: "address",
        name: "tokenIn",
        type: "address"
      },
      {
        internalType: "address",
        name: "",
        type: "address"
      },
      {
        internalType: "uint256",
        name: "amountIn",
        type: "uint256"
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256"
      },
      {
        internalType: "address",
        name: "maker",
        type: "address"
      },
      {
        internalType: "address",
        name: "app",
        type: "address"
      },
      {
        internalType: "bytes32",
        name: "strategyHash",
        type: "bytes32"
      },
      {
        internalType: "bytes",
        name: "",
        type: "bytes"
      }
    ],
    name: "xycSwapCallback",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const

