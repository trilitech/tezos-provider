import {
  PartialTezosOperation as PartialTezosOperationOriginal,
  PartialTezosOriginationOperation as PartialTezosOriginationOperationOriginal,
  TezosDrainDelegateOperation,
  TezosOperationType,
} from "@airgap/beacon-types";
import { describe, it, expect, beforeEach } from "@jest/globals";
import { ScriptedContracts } from "@taquito/rpc";
import { TezosToolkit } from "@taquito/taquito";
import { UniversalProvider } from "@walletconnect/universal-provider";
import BigNumber from "bignumber.js";

import { SAMPLES, SAMPLE_KINDS } from "./samples";
import {
  TezosChainDataMainnet,
  TezosChainDataTestnet,
  UnsupportedOperations,
} from "../src/constants";
import TezosProvider, { TezosProviderOpts } from "../src/TezosProvider";
import {
  TezosConnectionError,
  TezosConnectOpts,
  TezosMethod,
} from "../src/types";

interface PartialTezosOriginationOperation
  extends Omit<PartialTezosOriginationOperationOriginal, "script"> {
  script: ScriptedContracts;
}

type PartialTezosOperation =
  | Exclude<
      PartialTezosOperationOriginal,
      PartialTezosOriginationOperationOriginal
    >
  | PartialTezosOriginationOperation;

jest.mock("@walletconnect/universal-provider");
jest.mock("@taquito/taquito");

describe("TezosProvider", () => {
  let provider: TezosProvider;
  const mockConnect = jest.fn();
  const mockRequest = jest.fn();

  beforeEach(() => {
    jest.mocked(UniversalProvider.init).mockResolvedValue({
      on: jest.fn(),
      connect: mockConnect,
      request: mockRequest,
      session: {
        namespaces: { tezos: { accounts: ["tezos:mainnet:address1"] } },
      },
    } as unknown as InstanceType<typeof UniversalProvider>);

    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue([
        {
          status: "applied",
          originatedContract: { kind: "smart_contract", address: "KT1..." },
        },
      ]),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    (TezosProvider as any).instance = null;
  });

  it("should initialize the TezosProvider", async () => {
    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);

    expect(provider).toBeInstanceOf(TezosProvider);
    expect(UniversalProvider.init).toHaveBeenCalledTimes(1);
  });

  it("should connect to a specified chain", async () => {
    const opts: TezosProviderOpts = {
      projectId: "test",
      metadata: { name: "test", description: "test", url: "test", icons: [] },
    };
    provider = await TezosProvider.init(opts);

    const connectOpts: TezosConnectOpts = {
      chain: TezosChainDataTestnet,
      methods: [TezosMethod.GET_ACCOUNTS],
      events: [],
    };

    await provider.connect(connectOpts);

    expect(mockConnect).toHaveBeenCalledWith({
      namespaces: {
        tezos: {
          chains: ["tezos:ghostnet"],
          methods: [TezosMethod.GET_ACCOUNTS],
          events: [],
        },
      },
    });
    expect(provider.isConnected).toBe(true);
  });

  it("should throw TezosConnectionError if not connected when calling checkConnection", async () => {
    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);

    expect(() => provider.checkConnection()).toThrow(TezosConnectionError);
  });

  it("should get balance successfully", async () => {
    const mockGetBalance = jest.fn().mockResolvedValue(new BigNumber(1000000));
    const mockedTz = { getBalance: mockGetBalance };

    jest.mocked(TezosToolkit).mockImplementation(
      () =>
        ({
          tz: mockedTz,
        }) as unknown as InstanceType<typeof TezosToolkit>
    );

    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);
    await provider.connect({ chain: TezosChainDataMainnet });

    const balance = await provider.getBalance();

    expect(balance.balance).toBe(1000000);
    expect(balance.symbol).toBe("ꜩ");
    expect(balance.name).toBe("XTZ");
  });

  it("should throw error if balance is requested without address", async () => {
    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);

    await expect(provider.getBalance()).rejects.toThrow(TezosConnectionError);
  });

  it("should handle tezosSendTransaction correctly", async () => {
    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);
    await provider.connect({ chain: TezosChainDataMainnet });

    const mockSendResponse = { hash: "opHash" };
    mockRequest.mockResolvedValue(mockSendResponse);

    const result = await provider.sendTransaction({
      kind: TezosOperationType.TRANSACTION,
      destination: "tz1...",
      amount: "1000000",
    });

    expect(result.hash).toBe("opHash");
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: TezosMethod.SEND,
        params: expect.objectContaining({
          account: "address1",
        }),
      }),
      "tezos:mainnet"
    );
  });

  it("should handle tezos_getAccounts correctly", async () => {
    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);
    await provider.connect({ chain: TezosChainDataMainnet });

    const mockGetAccountsResponse = [
      {
        algo: "ed25519",
        address: "tz1hQHevf3TZbdVmhtxq7PAL4F4Hfaq7svYL",
        pubkey: "edpkvJ6FmCH1BgT7DpoHF8jDxwHVr2vbhYHbCST1oDJarxyxwV91Hd",
      },
      {
        algo: "ed25519",
        address: "tz1ZCvMYCB3WK9HTzjeXgLN7NJnHNRccwgRN",
        pubkey: "edpkvCcBxqYEV2bYLiqhteBpUhH3T2EdkXZ3EuKUYcbHN2RnLL9MgF",
      },
    ];
    mockRequest.mockResolvedValue(mockGetAccountsResponse);

    const result = await provider.getAccounts();

    expect(result).toEqual(mockGetAccountsResponse);
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: SAMPLE_KINDS.GET_ACCOUNTS,
      }),
      "tezos:mainnet"
    );
  });

  it("should handle tezos_sign correctly", async () => {
    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);
    await provider.connect({ chain: TezosChainDataMainnet });

    expect(provider.connection).toBeDefined();
    expect(provider.connection?.address).toBeDefined();

    const mockSignResponse = { signature: "sig..." };
    mockRequest.mockResolvedValue(mockSignResponse);

    const result = await provider.sign("0x1234567890abcdef");

    expect(result.signature).toBe("sig...");
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: TezosMethod.SIGN,
        params: expect.objectContaining({
          payload: "0x1234567890abcdef",
          account: provider.connection?.address,
        }),
      }),
      "tezos:mainnet"
    );
  });

  it("should throw error if sendTransaction is called without address", async () => {
    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);

    await expect(
      provider.sendTransaction({
        kind: TezosOperationType.TRANSACTION,
        destination: "tz1...",
        amount: "1000000",
      })
    ).rejects.toThrow(TezosConnectionError);
  });

  it("should call getContractAddress and return contract addresses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue([
        {
          status: "applied",
          originatedContract: { kind: "smart_contract", address: "KT1..." },
        },
      ]),
    });
    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);
    await provider.connect({ chain: TezosChainDataMainnet });
    expect(provider.connection).toBeDefined();

    const contractAddresses = await provider.getContractAddress("opHash");
    expect(contractAddresses).toEqual(["KT1..."]);
    const api = provider.chainMap["tezos:mainnet"].api;
    const expectedUrl = `${api}/operations/opHash`;
    expect(fetch).toHaveBeenCalledWith(expectedUrl);
  });

  it("should handle getCurrentProposal correctly", async () => {
    const mockGetCurrentProposal = jest.fn().mockResolvedValue("proposal_hash");
    const mockedRpcClientInterface = {
      getCurrentProposal: mockGetCurrentProposal,
    };
    jest.mocked(TezosToolkit).mockImplementation(
      () =>
        ({
          rpc: mockedRpcClientInterface,
        }) as unknown as InstanceType<typeof TezosToolkit>
    );

    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);
    await provider.connect({ chain: TezosChainDataMainnet });

    const proposal = await provider.getCurrentProposal();

    expect(proposal).toBe("proposal_hash");
  });
});

describe("TezosProvider Tests with Sample requests", () => {
  let provider: TezosProvider;
  const mockConnect = jest.fn();
  const mockRequest = jest.fn();

  beforeEach(async () => {
    jest.mocked(UniversalProvider.init).mockResolvedValue({
      on: jest.fn(),
      connect: mockConnect,
      request: mockRequest,
      session: {
        namespaces: { tezos: { accounts: ["tezos:mainnet:address1"] } },
      },
    } as unknown as InstanceType<typeof UniversalProvider>);

    mockConnect.mockClear();
    mockRequest.mockClear();

    provider = await TezosProvider.init({
      projectId: "test",
      metadata: {},
    } as TezosProviderOpts);
    await provider.connect({ chain: TezosChainDataMainnet });
    expect(provider.isConnected).toBe(true);
    expect(provider.connection).toBeDefined();

    (provider as any).request = mockRequest;
  });

  const runSampleTest = async (kind: SAMPLE_KINDS) => {
    const mockSendResponse = { hash: "opHash" };
    mockRequest.mockResolvedValue(mockSendResponse);

    let res: any = null;
    let operation: PartialTezosOperation | null = null;

    switch (kind) {
      case SAMPLE_KINDS.SEND_TRANSACTION:
        operation = SAMPLES[kind];
        res = await provider.sendTransaction(operation);
        break;
      case SAMPLE_KINDS.SEND_DELEGATION:
        operation = SAMPLES[kind];
        res = await provider.sendDelegation(operation);
        break;
      case SAMPLE_KINDS.SEND_UNDELEGATION:
        res = await provider.sendUndelegation();
        break;
      case SAMPLE_KINDS.SEND_ORGINATION:
        operation = SAMPLES[kind];
        res = await provider.sendOrigination(operation);
        break;
      case SAMPLE_KINDS.SEND_CONTRACT_CALL:
        operation = SAMPLES[kind];
        res = await provider.sendContractCall(operation);
        break;
      case SAMPLE_KINDS.SEND_STAKE:
        operation = SAMPLES[kind];
        res = await provider.sendStake(operation);
        operation.destination = provider.connection?.address ?? "";
        break;
      case SAMPLE_KINDS.SEND_UNSTAKE:
        operation = SAMPLES[kind];
        res = await provider.sendUnstake(operation);
        operation.destination = provider.connection?.address ?? "";
        break;
      case SAMPLE_KINDS.SEND_FINALIZE:
        operation = SAMPLES[kind];
        res = await provider.sendFinalizeUnstake(operation);
        operation.destination = provider.connection?.address ?? "";
        break;
      case SAMPLE_KINDS.SEND_INCREASE_PAID_STORAGE:
        operation = SAMPLES[kind];
        res = await provider.sendIncreasePaidStorage(operation);
        break;
      default:
        throw new Error(`Test: Unsupported kind ${kind}`);
    }

    expect(res.hash).toBe("opHash");
    if (operation) {
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: TezosMethod.SEND,
          params: {
            account: provider.connection?.address,
            operations: [operation],
          },
        }),
        "tezos:mainnet"
      );
    }
  };

  it("should handle tezosSendTransaction correctly", async () => {
    await runSampleTest(SAMPLE_KINDS.SEND_TRANSACTION);
  });

  it("should handle tezosSendOrigination correctly", async () => {
    await runSampleTest(SAMPLE_KINDS.SEND_ORGINATION);
  });

  it("should handle tezosSendContractCall correctly", async () => {
    await runSampleTest(SAMPLE_KINDS.SEND_CONTRACT_CALL);
  });

  it("should handle tezosSendDelegation correctly", async () => {
    await runSampleTest(SAMPLE_KINDS.SEND_DELEGATION);
  });

  it("should handle tezosSendUndelegation correctly", async () => {
    await runSampleTest(SAMPLE_KINDS.SEND_UNDELEGATION);
  });

  it("should handle tezosSendStake correctly", async () => {
    await runSampleTest(SAMPLE_KINDS.SEND_STAKE);
  });

  it("should handle tezosSendUnstake correctly", async () => {
    await runSampleTest(SAMPLE_KINDS.SEND_UNSTAKE);
  });

  it("should handle tezosSendFinalize correctly", async () => {
    await runSampleTest(SAMPLE_KINDS.SEND_FINALIZE);
  });

  it("should handle tezosSendIncreasePaidStorage correctly", async () => {
    await runSampleTest(SAMPLE_KINDS.SEND_INCREASE_PAID_STORAGE);
  });
  it("should throw an error for unsupported kind", async () => {
    const op: TezosDrainDelegateOperation = {
      kind: TezosOperationType.DRAIN_DELEGATE,
      consensus_key: "...",
      delegate: "tz1...",
      destination: "tz1...",
    };

    expect(UnsupportedOperations.includes(op.kind)).toBe(true);
    await expect(provider.send(op)).rejects.toThrowError(
      "Operation drain_delegate is not supported"
    );
  });
});

describe("TezosProvider Static Methods", () => {
  // Tests for extractChainId
  describe("extractChainId", () => {
    it("should return the part after the colon when colon exists in the chain string", () => {
      const chain = "tezos:mainnet";
      const result = TezosProvider.extractChainId(chain);
      expect(result).toBe("mainnet");
    });

    it("should return the entire string if there is no colon in the chain string", () => {
      const chain = "mainnet";
      const result = TezosProvider.extractChainId(chain);
      expect(result).toBe("mainnet");
    });

    it("should handle empty string and return empty string", () => {
      const chain = "";
      const result = TezosProvider.extractChainId(chain);
      expect(result).toBe("");
    });
  });

  // Tests for formatTezosBalance
  describe("formatTezosBalance", () => {
    it("should format the Tezos balance correctly", () => {
      const asset = {
        name: "Tezos",
        balance: 3_000_000, // equivalent to 3 Tezos
        symbol: "XTZ",
      };
      const result = TezosProvider.formatTezosBalance(asset);
      expect(result).toBe("Tezos: 3.000000 XTZ");
    });

    it("should handle balance less than 1 Tezos and format it correctly", () => {
      const asset = {
        name: "Tezos",
        balance: 500_000, // equivalent to 0.5 Tezos
        symbol: "XTZ",
      };
      const result = TezosProvider.formatTezosBalance(asset);
      expect(result).toBe("Tezos: 0.500000 XTZ");
    });

    it("should format 0 balance correctly", () => {
      const asset = {
        name: "Tezos",
        balance: 0, // 0 Tezos
        symbol: "XTZ",
      };
      const result = TezosProvider.formatTezosBalance(asset);
      expect(result).toBe("Tezos: 0.000000 XTZ");
    });

    it("should handle large balance values and format them correctly", () => {
      const asset = {
        name: "Tezos",
        balance: 10_000_000_000, // equivalent to 10,000 Tezos
        symbol: "XTZ",
      };
      const result = TezosProvider.formatTezosBalance(asset);
      expect(result).toBe("Tezos: 10000.000000 XTZ");
    });
  });
});
