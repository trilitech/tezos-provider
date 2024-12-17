import {
  type PartialTezosDelegationOperation,
  type PartialTezosIncreasePaidStorageOperation,
  type PartialTezosOriginationOperation as PartialTezosOriginationOperationOriginal,
  type PartialTezosTransactionOperation,
  TezosOperationType,
} from "@airgap/beacon-types";
import { type ScriptedContracts } from "@taquito/rpc";

interface PartialTezosOriginationOperation
  extends Omit<PartialTezosOriginationOperationOriginal, "script"> {
  script: ScriptedContracts;
}

export enum SAMPLE_KINDS {
  GET_ACCOUNTS = "tezos_getAccounts",
  SIGN = "tezos_sign",
  SEND_TRANSACTION = "tezos_send:transaction",
  SEND_ORGINATION = "tezos_send:origination",
  SEND_CONTRACT_CALL = "tezos_send:contract_call",
  SEND_DELEGATION = "tezos_send:delegation",
  SEND_UNDELEGATION = "tezos_send:undelegation",
  SEND_STAKE = "tezos_send:stake",
  SEND_UNSTAKE = "tezos_send:unstake",
  SEND_FINALIZE = "tezos_send:finalize",
  SEND_INCREASE_PAID_STORAGE = "tezos_send:increase_paid_storage",
}

const tezosTransactionOperation: PartialTezosTransactionOperation = {
  amount: "100000",
  destination: "tz3ZmB8oWUmi8YZXgeRpgAcPnEMD8VgUa4Ve", // Tezos Foundation Ghost Baker
  kind: TezosOperationType.TRANSACTION,
};

const tezosOriginationOperation: PartialTezosOriginationOperation = {
  balance: "1",
  kind: TezosOperationType.ORIGINATION,
  script: {
    // This contract adds the parameter to the storage value
    code: [
      { args: [{ prim: "int" }], prim: "parameter" },
      { args: [{ prim: "int" }], prim: "storage" },
      {
        args: [
          [
            { prim: "DUP" }, // Duplicate the parameter (parameter is pushed onto the stack)
            { prim: "CAR" }, // Access the parameter from the stack (parameter is on top)
            { args: [[{ prim: "CDR" }]], prim: "DIP" }, // Access the storage value (storage is on the stack)
            { prim: "ADD" }, // Add the parameter to the storage value
            { args: [{ prim: "operation" }], prim: "NIL" }, // Create an empty list of operations
            { prim: "PAIR" }, // Pair the updated storage with the empty list of operations
          ],
        ],
        prim: "code",
      },
    ],
    storage: { int: "10" },
  },
};

const tezosContractCallOperation: PartialTezosTransactionOperation = {
  amount: "0",
  destination: "KT1LwhHE2CzYcqzAe9zZqRcJQnYboVdczXVW",
  kind: TezosOperationType.TRANSACTION,
  parameters: { entrypoint: "default", value: { int: "20" } }, // Add 20 to the current storage value
};

const tezosDelegationOperation: PartialTezosDelegationOperation = {
  delegate: "tz3ZmB8oWUmi8YZXgeRpgAcPnEMD8VgUa4Ve", // Tezos Foundation Ghost Baker. Cannot delegate to ourself as that would block undelegation
  kind: TezosOperationType.DELEGATION,
};

const tezosUndelegationOperation: PartialTezosDelegationOperation = {
  kind: TezosOperationType.DELEGATION,
};

const tezosStakeOperation: PartialTezosTransactionOperation = {
  amount: "1000000",
  destination: "[own adress]",
  kind: TezosOperationType.TRANSACTION,
  parameters: {
    entrypoint: "stake",
    value: { prim: "Unit" },
  },
};

const tezosUnstakeOperation: PartialTezosTransactionOperation = {
  amount: "1000000",
  destination: "[own adress]",
  kind: TezosOperationType.TRANSACTION,
  parameters: {
    entrypoint: "unstake",
    value: { prim: "Unit" },
  },
};

const tezosFinalizeOperation: PartialTezosTransactionOperation = {
  amount: "0",
  destination: "[own adress]",
  kind: TezosOperationType.TRANSACTION,
  parameters: {
    entrypoint: "finalize_unstake",
    value: { prim: "Unit" },
  },
};

const tezosIncreasePaidStorageOperation: PartialTezosIncreasePaidStorageOperation =
  {
    amount: "10",
    destination: "KT1LwhHE2CzYcqzAe9zZqRcJQnYboVdczXVW",
    kind: TezosOperationType.INCREASE_PAID_STORAGE,
  };

// Assign the specific types to the TEZOS_ACTIONS object
export const SAMPLES = {
  "tezos_send:contract_call": tezosContractCallOperation,
  "tezos_send:delegation": tezosDelegationOperation,
  "tezos_send:finalize": tezosFinalizeOperation,
  "tezos_send:increase_paid_storage": tezosIncreasePaidStorageOperation,
  "tezos_send:origination": tezosOriginationOperation,
  "tezos_send:stake": tezosStakeOperation,
  "tezos_send:transaction": tezosTransactionOperation,
  "tezos_send:undelegation": tezosUndelegationOperation,
  "tezos_send:unstake": tezosUnstakeOperation,
};

export enum DEFAULT_TEZOS_EVENTS {}
