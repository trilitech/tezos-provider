import {
  PartialTezosDalPublishCommitmentOperation,
  PartialTezosDelegationOperation,
  PartialTezosIncreasePaidStorageOperation,
  PartialTezosOperation as PartialTezosOperationOriginal,
  PartialTezosOriginationOperation as PartialTezosOriginationOperationOriginal,
  PartialTezosRegisterGlobalConstantOperation,
  PartialTezosRevealOperation,
  PartialTezosSetDepositsLimitOperation,
  PartialTezosSmartRollupAddMessagesOperation,
  PartialTezosSmartRollupCementOperation,
  PartialTezosSmartRollupExecuteOutboxMessageOperation,
  PartialTezosSmartRollupOriginateOperation,
  PartialTezosSmartRollupPublishOperation,
  PartialTezosSmartRollupRecoverBondOperation,
  PartialTezosSmartRollupRefuteOperation,
  PartialTezosSmartRollupTimeoutOperation,
  PartialTezosTransactionOperation,
  PartialTezosTransferTicketOperation,
  PartialTezosUpdateConsensusKeyOperation,
  TezosActivateAccountOperation,
  TezosBallotOperation,
  TezosFailingNoopOperation,
  TezosOperationType,
  TezosProposalOperation,
} from "@airgap/beacon-types";
import { ScriptedContracts } from "@taquito/rpc";
import { TezosToolkit } from "@taquito/taquito";
import { KeyValueStorageOptions } from "@walletconnect/keyvaluestorage";
import { Logger } from "@walletconnect/logger";
import { SessionTypes } from "@walletconnect/types";
import { UniversalProvider, Metadata } from "@walletconnect/universal-provider";

import {
  DefaultTezosMethods,
  RelayUrl,
  TezosChainDataTestnet,
  TezosChainMap,
  UnsupportedOperations,
} from "./constants";
import {
  AssetData,
  ChainsMap,
  TezosConnectionError,
  TezosConnectOpts,
  TezosGetAccountResponse,
  TezosInitializationError,
  TezosMethod,
  TezosProviderError,
  TezosSendResponse,
  TezosSignResponse,
} from "./types";

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

interface Operation {
  status: string;
  originatedContract: {
    kind: string;
    address: string;
  };
}
export interface TezosProviderOpts {
  projectId: string;
  metadata: Metadata;
  relayUrl?: string;
  storageOptions?: KeyValueStorageOptions;
  disableProviderPing?: boolean;
  logger?: string | Logger; // default: "info"
}

interface ConnectionData {
  chainId: string;
  accounts: string[];
  address: string;
  tezosToolkit: TezosToolkit;
}

type RequiredProviderOpts = Required<TezosProviderOpts>;
type RequiredConnectOpts = Required<TezosConnectOpts>;

// Provides a way to interact with the Tezos blockchain.
// Secures that WalletConnect is used with PartialTezosOperation
export class TezosProvider {
  private static instance: TezosProvider | null = null;
  public namespace: string = "tezos";
  public signer: InstanceType<typeof UniversalProvider>;

  public config: RequiredProviderOpts;
  public connection: ConnectionData | null = null;
  public isConnected: boolean = false;
  public chainMap: ChainsMap = TezosChainMap;

  private constructor(
    signer: InstanceType<typeof UniversalProvider>,
    config: RequiredProviderOpts
  ) {
    this.signer = signer;
    this.config = config;

    this.signer.on("connect", () => {
      this.isConnected = true;
    });
    this.signer.on("disconnect", () => {
      this.isConnected = false;
      this.connection = null;
    });
  }

  static init = async (opts: TezosProviderOpts): Promise<TezosProvider> => {
    if (TezosProvider.instance) {
      return TezosProvider.instance;
    }
    const config: RequiredProviderOpts = {
      projectId: opts.projectId,
      metadata: opts.metadata,
      relayUrl: opts.relayUrl || RelayUrl,
      storageOptions: opts.storageOptions || {},
      disableProviderPing: opts.disableProviderPing || false,
      logger: opts.logger || "info",
    };

    const signer = await UniversalProvider.init({ ...config });

    TezosProvider.instance = new TezosProvider(signer, config);
    return TezosProvider.instance;
  };
  static getInstance(): TezosProvider {
    if (!TezosProvider.instance) {
      throw new TezosInitializationError();
    }
    return TezosProvider.instance;
  }

  static extractChainId = (chain: string): string => {
    return chain.includes(":") ? chain.split(":")[1] : chain;
  };

  static formatTezosBalance = (asset: AssetData): string => {
    const formattedBalance = (asset.balance / 1_000_000).toFixed(6);
    return `${asset.name}: ${formattedBalance} ${asset.symbol}`;
  };

  // Override connect method
  public connect = async (
    opts: TezosConnectOpts
  ): Promise<SessionTypes.Struct | undefined> => {
    const config: RequiredConnectOpts = {
      chain: opts.chain || TezosChainDataTestnet,
      methods: opts.methods || DefaultTezosMethods,
      events: opts.events || [],
    };

    const rpcUrl = config.chain.rpc[0];

    let res = await this.signer.connect({
      namespaces: {
        tezos: {
          chains: [config.chain.id],
          methods: config.methods || DefaultTezosMethods,
          events: config.events || [],
        },
      },
    });
    this.isConnected = true;

    // Set the address if the session exists
    if (this.signer.session) {
      let accounts =
        this.signer.session.namespaces.tezos?.accounts.map(
          account => account.split(":")[2]
        ) ?? [];
      if (!accounts.length) {
        throw new TezosProviderError("No accounts found in session");
      }
      // Ensure accounts array is unique
      this.connection = {
        chainId: config.chain.id,
        accounts: [...new Set(accounts)],
        address: accounts[0],
        tezosToolkit: new TezosToolkit(rpcUrl),
      };
    }
    return res;
  };

  public getChainId = (): string | undefined => {
    if (!this.config) {
      throw new TezosInitializationError();
    }
    if (!this.connection) {
      throw new TezosConnectionError();
    }
    return this.connection.chainId;
  };

  // Method to get account balance
  public getBalance = async (): Promise<AssetData> => {
    if (!this.connection) {
      throw new TezosConnectionError();
    }
    const balance = await this.connection.tezosToolkit.tz.getBalance(
      this.connection.address
    );
    const balanceInTez = balance.toNumber();
    return {
      balance: balanceInTez,
      symbol: "ꜩ",
      name: "XTZ",
    };
  };

  public getFormattedBalance = async (): Promise<string> => {
    const balance = await this.getBalance();
    return `${balance.balance.toFixed(6)} ꜩ`;
  };

  public getContractAddress = async (hash: string): Promise<string[]> => {
    if (!hash) {
      throw new TezosProviderError(`No hash provided`);
    }
    if (!this.connection) {
      throw new TezosConnectionError();
    }

    const api = this.chainMap[this.connection.chainId].api;
    const path = `${api}/operations/${hash}`;
    const response = await globalThis.fetch(path);
    const data = (await response.json()) as Operation[];

    return data
      .map((op: any) => {
        const address =
          op?.status === "applied" &&
          op?.originatedContract?.kind === "smart_contract"
            ? op.originatedContract.address
            : "";
        return address;
      })
      .filter((address: string) => address.length);
  };

  public getCurrentProposal = async (): Promise<string | null> => {
    if (!this.connection) {
      throw new TezosConnectionError();
    }
    const currentProposal =
      await this.connection.tezosToolkit.rpc.getCurrentProposal();
    return currentProposal;
  };

  public checkConnection = (): boolean => {
    if (!this.isConnected || !this.connection) {
      throw new TezosConnectionError();
    }
    return true;
  };

  // Requests using the WalletConnect connection

  public getAccounts = async (): Promise<TezosGetAccountResponse> => {
    if (!this.connection) {
      throw new TezosConnectionError();
    }
    if (!this.signer) {
      throw new TezosInitializationError();
    }
    this.checkConnection();

    const result = await this.signer.request<TezosGetAccountResponse>(
      {
        method: TezosMethod.GET_ACCOUNTS,
        params: {},
      },
      this.connection.chainId
    );
    this.connection.accounts = result.map(account => account.address);

    return result;
  };

  // Method to sign a message
  public sign = async (payload: string): Promise<TezosSignResponse> => {
    if (!this.connection) {
      throw new TezosConnectionError();
    }
    if (!this.signer) {
      throw new TezosInitializationError();
    }
    this.checkConnection();

    const result = await this.signer.request<TezosSignResponse>(
      {
        method: TezosMethod.SIGN,
        params: {
          account: this.connection.address,
          payload,
        },
      },
      this.connection.chainId
    );

    return result;
  };

  // Method to send operations
  public send = async (
    op: PartialTezosOperation
  ): Promise<TezosSendResponse> => {
    if (!this.signer) {
      throw new TezosInitializationError();
    }
    if (!this.connection) {
      throw new TezosConnectionError();
    }
    if (UnsupportedOperations.includes(op.kind)) {
      throw new TezosProviderError(
        `Operation ${op.kind} is not supported for wallets`
      );
    }

    const result = await this.signer.request<TezosSendResponse>(
      {
        method: TezosMethod.SEND,
        params: {
          account: this.connection.address,
          operations: [op],
        },
      },
      this.connection.chainId
    );
    return result;
  };

  // Method to send a transaction
  public sendTransaction = (
    op: PartialTezosTransactionOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  // Method to send a delegation
  public sendDelegation = (
    op: PartialTezosDelegationOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  // Method to send an undelegation
  public sendUndelegation = (): Promise<TezosSendResponse> => {
    const op: PartialTezosDelegationOperation = {
      kind: TezosOperationType.DELEGATION,
    };
    return this.send(op);
  };

  // Method to originate a contract
  public sendOrigination = (
    op: PartialTezosOriginationOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  // Method to call a smart contract: destination is the contract address, entrypoint as defined in the contract
  public sendContractCall = (
    op: PartialTezosTransactionOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendStake = (
    op: PartialTezosTransactionOperation
  ): Promise<TezosSendResponse> => {
    if (!this.connection) {
      throw new TezosConnectionError();
    }
    return this.send({
      ...op,
      destination: this.connection.address,
      parameters: { entrypoint: "stake", value: { prim: "Unit" } },
    });
  };

  public sendUnstake = (
    op: PartialTezosTransactionOperation
  ): Promise<TezosSendResponse> => {
    if (!this.connection) {
      throw new TezosConnectionError();
    }
    return this.send({
      ...op,
      destination: this.connection.address,
      parameters: { entrypoint: "unstake", value: { prim: "Unit" } },
    });
  };

  public sendFinalizeUnstake = (
    op: PartialTezosTransactionOperation
  ): Promise<TezosSendResponse> => {
    if (!this.connection) {
      throw new TezosConnectionError();
    }
    return this.send({
      ...op,
      destination: this.connection.address,
      parameters: { entrypoint: "finalize_unstake", value: { prim: "Unit" } },
    });
  };

  public sendActivateAccount = (
    op: TezosActivateAccountOperation
  ): Promise<TezosSendResponse> => {
    if (!this.connection) {
      throw new TezosConnectionError();
    }
    return this.send({ ...op, pkh: this.connection.address });
  };

  public sendBallot = (
    op: TezosBallotOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendDalPublishCommitment = (
    op: PartialTezosDalPublishCommitmentOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendFailingNoop = (
    op: TezosFailingNoopOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendIncreasePaidStorage = (
    op: PartialTezosIncreasePaidStorageOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendProposal = (
    op: TezosProposalOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendRegisterGlobalConstant = (
    op: PartialTezosRegisterGlobalConstantOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendReveal = (
    op: PartialTezosRevealOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendSetDepositsLimit = (
    op: PartialTezosSetDepositsLimitOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendSmartRollupAddMessages = (
    op: PartialTezosSmartRollupAddMessagesOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendSmartRollupCement = (
    op: PartialTezosSmartRollupCementOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendSmartRollupExecuteOutboxMessage = (
    op: PartialTezosSmartRollupExecuteOutboxMessageOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendSmartRollupOriginate = (
    op: PartialTezosSmartRollupOriginateOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendSmartRollupPublish = (
    op: PartialTezosSmartRollupPublishOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendSmartRollupRecoverBond = (
    op: PartialTezosSmartRollupRecoverBondOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendSmartRollupRefute = (
    op: PartialTezosSmartRollupRefuteOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendSmartRollupTimeout = (
    op: PartialTezosSmartRollupTimeoutOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendTransferTicket = (
    op: PartialTezosTransferTicketOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };

  public sendUpdateConsensusKey = (
    op: PartialTezosUpdateConsensusKeyOperation
  ): Promise<TezosSendResponse> => {
    return this.send(op);
  };
}

export default TezosProvider;
