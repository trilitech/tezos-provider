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
import axios from "axios";

import {
  DefaultTezosMethods,
  RelayUrl,
  TezosChainDataMainnet,
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

export interface TezosProviderOpts {
  projectId: string;
  metadata: Metadata;
  relayUrl?: string;
  storageOptions?: KeyValueStorageOptions;
  disableProviderPing?: boolean;
  logger?: string | Logger; // default: "info"
}

// Provides a way to interact with the Tezos blockchain.
// Secures that WalletConnect is used with PartialTezosOperation
export class TezosProvider {
  public namespace: string = "tezos";
  public signer?: InstanceType<typeof UniversalProvider> = undefined;
  private tezosToolkit?: TezosToolkit;
  public address?: string;
  public isConnected: boolean = false;
  public config?: TezosProviderOpts;
  public chainId: string = "";
  public chainMap: ChainsMap = TezosChainMap;
  public accounts: string[] = [];

  constructor() {}

  static init = async (
    opts: TezosProviderOpts = {
      projectId: "",
      metadata: {} as Metadata,
      relayUrl: RelayUrl, // default relay
      storageOptions: {} as KeyValueStorageOptions,
      disableProviderPing: false, // default is to enable ping
      logger: "info", // default log level
    }
  ): Promise<TezosProvider> => {
    const provider = new TezosProvider();
    await provider.initialize(opts);
    return provider;
  };

  protected initialize = async (opts: TezosProviderOpts): Promise<void> => {
    this.config = {
      ...opts,
    };
    this.signer = await UniversalProvider.init({
      ...opts,
    });

    this.signer.on("connect", () => {
      this.isConnected = true;
    });
    this.signer.on("disconnect", () => {
      this.isConnected = false;
    });
  };

  static extractChainId = (chain: string): string => {
    return chain.includes(":") ? chain.split(":")[1] : chain;
  };

  static formatTezosBalance = (asset: AssetData): string => {
    const formattedBalance = (asset.balance / 1_000_000).toFixed(6);
    return `${asset.name}: ${formattedBalance} ${asset.symbol}`;
  };

  // Override connect method
  public connect = async (
    opts: TezosConnectOpts = {
      chains: [TezosChainDataTestnet, TezosChainDataMainnet],
      methods: DefaultTezosMethods,
      events: [],
    }
  ): Promise<SessionTypes.Struct | undefined> => {
    if (!this.signer || !this.config) {
      throw new TezosInitializationError();
    }
    if (!opts.chains || !opts.chains.length) {
      throw new TezosProviderError("No chains provided");
    }

    this.chainId = opts.chains[0].id;

    // convert chain data to map with chain id as a key
    this.chainMap = opts.chains.reduce((acc, chain) => {
      acc[chain.id] = chain;
      return acc;
    }, {} as ChainsMap);

    let res = await this.signer.connect({
      namespaces: {
        tezos: {
          chains: opts.chains.map(chain => chain.id),
          methods: opts.methods ?? DefaultTezosMethods,
          events: opts.events ?? [],
        },
      },
    });
    this.isConnected = true;

    const rpcUrl = this.chainMap[this.chainId].rpc[0];
    this.tezosToolkit = new TezosToolkit(rpcUrl);

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
      this.accounts = [...new Set(accounts)];
      this.setAddress(this.accounts[0]);
    }
    return res;
  };

  public setAddress = (address: string): void => {
    if (!this.accounts.includes(address)) {
      throw new TezosProviderError(
        `Address ${address} not found in accounts ${this.accounts}. Get Accounts first.`
      );
    }
    this.address = address;
  };

  public getChainId = (): string | undefined => {
    if (!this.config) {
      throw new TezosInitializationError();
    }
    return this.chainId;
  };

  // Method to get account balance
  public getBalance = async (): Promise<AssetData> => {
    if (!this.address) {
      throw new TezosConnectionError();
    }
    if (!this.tezosToolkit) {
      throw new TezosProviderError("tezosToolkit is not initialized");
    }
    const balance = await this.tezosToolkit.tz.getBalance(this.address);
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

    const api = this.chainMap[this.chainId].api;
    const path = `${api}/operations/${hash}`;
    const response = await axios.get(path);
    const data = response.data;

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
    if (!this.tezosToolkit) {
      throw new TezosProviderError("tezosToolkit is not initialized");
    }
    const currentProposal = await this.tezosToolkit.rpc.getCurrentProposal();
    return currentProposal;
  };

  public checkConnection = (): boolean => {
    if (!this.isConnected || !this.address) {
      throw new TezosConnectionError();
    }
    return true;
  };

  // Requests using the WalletConnect connection

  public getAccounts = async (): Promise<TezosGetAccountResponse> => {
    if (!this.signer) {
      throw new TezosInitializationError();
    }
    this.checkConnection();

    const result = await this.signer.request<TezosGetAccountResponse>(
      {
        method: TezosMethod.GET_ACCOUNTS,
        params: {},
      },
      this.chainId
    );
    this.accounts = result.map(account => account.address);

    return result;
  };

  // Method to sign a message
  public sign = async (payload: string): Promise<TezosSignResponse> => {
    if (!this.signer) {
      throw new TezosInitializationError();
    }
    this.checkConnection();

    const result = await this.signer.request<TezosSignResponse>(
      {
        method: TezosMethod.SIGN,
        params: {
          account: this.address,
          payload,
        },
      },
      this.chainId
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
    if (!this.address) {
      throw new TezosConnectionError();
    }
    if (UnsupportedOperations.includes(op.kind)) {
      throw new TezosProviderError(
        `Operation ${op.kind} is not supported for wallets`
      );
    }

    this.checkConnection();

    const result = await this.signer.request<TezosSendResponse>(
      {
        method: TezosMethod.SEND,
        params: {
          account: this.address,
          operations: [op],
        },
      },
      this.chainId
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
    if (!this.address) {
      throw new TezosConnectionError();
    }
    return this.send({
      ...op,
      destination: this.address,
      parameters: { entrypoint: "stake", value: { prim: "Unit" } },
    });
  };

  public sendUnstake = (
    op: PartialTezosTransactionOperation
  ): Promise<TezosSendResponse> => {
    if (!this.address) {
      throw new TezosConnectionError();
    }
    return this.send({
      ...op,
      destination: this.address,
      parameters: { entrypoint: "unstake", value: { prim: "Unit" } },
    });
  };

  public sendFinalizeUnstake = (
    op: PartialTezosTransactionOperation
  ): Promise<TezosSendResponse> => {
    if (!this.address) {
      throw new TezosConnectionError();
    }
    return this.send({
      ...op,
      destination: this.address,
      parameters: { entrypoint: "finalize_unstake", value: { prim: "Unit" } },
    });
  };

  public sendActivateAccount = (
    op: TezosActivateAccountOperation
  ): Promise<TezosSendResponse> => {
    if (!this.address) {
      throw new TezosConnectionError();
    }
    return this.send({ ...op, pkh: this.address });
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
