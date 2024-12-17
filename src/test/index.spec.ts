import {
  type PartialTezosOperation as PartialTezosOperationOriginal,
  type PartialTezosOriginationOperation as PartialTezosOriginationOperationOriginal,
  type TezosDrainDelegateOperation,
  TezosOperationType,
} from "@airgap/beacon-types";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { type ScriptedContracts } from "@taquito/rpc";
import { TezosToolkit } from "@taquito/taquito";
import { UniversalProvider } from "@walletconnect/universal-provider";
import BigNumber from "bignumber.js";

import { SAMPLES, SAMPLE_KINDS } from "./samples";
import {
  TezosChainDataMainnet,
  TezosChainDataTestnet,
  UnsupportedOperations,
} from "../constants";
import TezosProvider, { type TezosProviderOpts } from "../TezosProvider";
import {
  type TezosConnectOpts,
  TezosConnectionError,
  TezosMethod,
} from "../types";

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
      connect: mockConnect,
      on: jest.fn(),
      request: mockRequest,
      session: {
        namespaces: { tezos: { accounts: ["tezos:mainnet:address1"] } },
      },
    } as unknown as InstanceType<typeof UniversalProvider>);

    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue([
        {
          originatedContract: { address: "KT1...", kind: "smart_contract" },
          status: "applied",
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
      metadata: {},
      projectId: "test",
    } as TezosProviderOpts);

    expect(provider).toBeInstanceOf(TezosProvider);
    expect(UniversalProvider.init).toHaveBeenCalledTimes(1);
  });

  it("should connect to a specified chain", async () => {
    const opts: TezosProviderOpts = {
      metadata: { description: "test", icons: [], name: "test", url: "test" },
      projectId: "test",
    };
    provider = await TezosProvider.init(opts);

    const connectOpts: TezosConnectOpts = {
      chain: TezosChainDataTestnet,
      events: [],
      methods: [TezosMethod.GET_ACCOUNTS],
    };

    await provider.connect(connectOpts);

    expect(mockConnect).toHaveBeenCalledWith({
      namespaces: {
        tezos: {
          chains: ["tezos:ghostnet"],
          events: [],
          methods: [TezosMethod.GET_ACCOUNTS],
        },
      },
    });
    expect(provider.isConnected).toBe(true);
  });

  it("should throw TezosConnectionError if not connected when calling checkConnection", async () => {
    provider = await TezosProvider.init({
      metadata: {},
      projectId: "test",
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
      metadata: {},
      projectId: "test",
    } as TezosProviderOpts);
    await provider.connect({ chain: TezosChainDataMainnet });

    const balance = await provider.getBalance();

    expect(balance.balance).toBe(1000000);
    expect(balance.symbol).toBe("ꜩ");
    expect(balance.name).toBe("XTZ");
  });

  it("should throw error if balance is requested without address", async () => {
    provider = await TezosProvider.init({
      metadata: {},
      projectId: "test",
    } as TezosProviderOpts);

    await expect(provider.getBalance()).rejects.toThrow(TezosConnectionError);
  });

  it("should handle tezosSendTransaction correctly", async () => {
    provider = await TezosProvider.init({
      metadata: {},
      projectId: "test",
    } as TezosProviderOpts);
    await provider.connect({ chain: TezosChainDataMainnet });

    const mockSendResponse = { hash: "opHash" };
    mockRequest.mockResolvedValue(mockSendResponse);

    const result = await provider.sendTransaction({
      amount: "1000000",
      destination: "tz1...",
      kind: TezosOperationType.TRANSACTION,
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
      metadata: {},
      projectId: "test",
    } as TezosProviderOpts);
    await provider.connect({ chain: TezosChainDataMainnet });

    const mockGetAccountsResponse = [
      {
        address: "tz1hQHevf3TZbdVmhtxq7PAL4F4Hfaq7svYL",
        algo: "ed25519",
        pubkey: "edpkvJ6FmCH1BgT7DpoHF8jDxwHVr2vbhYHbCST1oDJarxyxwV91Hd",
      },
      {
        address: "tz1ZCvMYCB3WK9HTzjeXgLN7NJnHNRccwgRN",
        algo: "ed25519",
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
      metadata: {},
      projectId: "test",
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
          account: provider.connection?.address,
          payload: "0x1234567890abcdef",
        }),
      }),
      "tezos:mainnet"
    );
  });

  it("should throw error if sendTransaction is called without address", async () => {
    provider = await TezosProvider.init({
      metadata: {},
      projectId: "test",
    } as TezosProviderOpts);

    await expect(
      provider.sendTransaction({
        amount: "1000000",
        destination: "tz1...",
        kind: TezosOperationType.TRANSACTION,
      })
    ).rejects.toThrow(TezosConnectionError);
  });

  it("should call getContractAddress and return contract addresses", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue([
        {
          originatedContract: { address: "KT1...", kind: "smart_contract" },
          status: "applied",
        },
      ]),
    });
    provider = await TezosProvider.init({
      metadata: {},
      projectId: "test",
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
      metadata: {},
      projectId: "test",
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
      connect: mockConnect,
      on: jest.fn(),
      request: mockRequest,
      session: {
        namespaces: { tezos: { accounts: ["tezos:mainnet:address1"] } },
      },
    } as unknown as InstanceType<typeof UniversalProvider>);

    mockConnect.mockClear();
    mockRequest.mockClear();

    provider = await TezosProvider.init({
      metadata: {},
      projectId: "test",
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
      case SAMPLE_KINDS.GET_ACCOUNTS:
        throw new Error(`Test: Unsupported kind ${kind}`);
      case SAMPLE_KINDS.SIGN:
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
      consensus_key: "...",
      delegate: "tz1...",
      destination: "tz1...",
      kind: TezosOperationType.DRAIN_DELEGATE,
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
        balance: 3_000_000, // equivalent to 3 Tezos
        name: "Tezos",
        symbol: "XTZ",
      };
      const result = TezosProvider.formatTezosBalance(asset);
      expect(result).toBe("Tezos: 3.000000 XTZ");
    });

    it("should handle balance less than 1 Tezos and format it correctly", () => {
      const asset = {
        balance: 500_000, // equivalent to 0.5 Tezos
        name: "Tezos",
        symbol: "XTZ",
      };
      const result = TezosProvider.formatTezosBalance(asset);
      expect(result).toBe("Tezos: 0.500000 XTZ");
    });

    it("should format 0 balance correctly", () => {
      const asset = {
        balance: 0, // 0 Tezos
        name: "Tezos",
        symbol: "XTZ",
      };
      const result = TezosProvider.formatTezosBalance(asset);
      expect(result).toBe("Tezos: 0.000000 XTZ");
    });

    it("should handle large balance values and format them correctly", () => {
      const asset = {
        balance: 10_000_000_000, // equivalent to 10,000 Tezos
        name: "Tezos",
        symbol: "XTZ",
      };
      const result = TezosProvider.formatTezosBalance(asset);
      expect(result).toBe("Tezos: 10000.000000 XTZ");
    });
  });
});
