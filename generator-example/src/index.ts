import {serializeInput, blake2b, hexToBytes, AddressPrefix, getTransactionSize, addressToScript, PERSONAL} from "@nervosnetwork/ckb-sdk-utils";
import { CKB_UNIT, Collector, MAX_FEE, MIN_CAPACITY, NoLiveCellError, SECP256K1_WITNESS_LOCK_SIZE, append0x, calculateTransactionFee, getSecp256k1CellDep, remove0x, u64ToLe } from "@rgbpp-sdk/ckb";

// CKB SECP256K1 private key
const CKB_TEST_PRIVATE_KEY = "0x0000000000000000000000000000000000000000000000000000000000000001";

// Unique type script Testnet deployment
const TESTNET_UNIQUE_TYPE_CELL_DEP = {
  outPoint: {
    txHash: "0xff91b063c78ed06f10a1ed436122bd7d671f9a72ef5f5fa28d05252c17cf4cef",
    index: "0x0",
  },
  depType: "code",
} as CKBComponents.CellDep;

const TESTNET_UNIQUE_TYPE_SCRIPT = {
  codeHash: "0x8e341bcfec6393dcd41e635733ff2dca00a6af546949f70c57a706c0f344df8b",
  hashType: "type",
  args: "",
} as CKBComponents.Script;

// Unique type script Mainnet deployment
const MAINNET_UNIQUE_TYPE_CELL_DEP = {
  outPoint: {
    txHash: "0x67524c01c0cb5492e499c7c7e406f2f9d823e162d6b0cf432eacde0c9808c2ad",
    index: "0x0",
  },
  depType: "code",
} as CKBComponents.CellDep;

const MAINNET_UNIQUE_TYPE_SCRIPT = {
  codeHash: "0x2c8c11c985da60b0a330c61a85507416d6382c130ba67f0c47ab071e00aec628",
  hashType: "data1",
  args: "",
} as CKBComponents.Script;


const generateUniqueTypeArgs = (firstInput: CKBComponents.CellInput, firstOutputIndex: number) => {
  const input = hexToBytes(serializeInput(firstInput));
  const s = blake2b(32, null, null, PERSONAL);
  s.update(input);
  s.update(hexToBytes(`0x${u64ToLe(BigInt(firstOutputIndex))}`));
  return `0x${s.digest("hex").slice(0, 40)}`;
};


const createUniqueCell = async () => {
  const collector = new Collector({
    ckbNodeUrl: "https://testnet.ckb.dev/rpc",
    ckbIndexerUrl: "https://testnet.ckb.dev/indexer",
  });

  const isMainnet = false;
  // TODO: Replace the xudtInfo with your own info
  const xudtInfo = "0x081234";

  const uniqueTypeScript = isMainnet ? MAINNET_UNIQUE_TYPE_SCRIPT : TESTNET_UNIQUE_TYPE_SCRIPT;
  const uniqueCellDep = isMainnet ? MAINNET_UNIQUE_TYPE_CELL_DEP : TESTNET_UNIQUE_TYPE_CELL_DEP;

  const address = collector.getCkb().utils.privateKeyToAddress(CKB_TEST_PRIVATE_KEY, {prefix: AddressPrefix.Testnet});
  // ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq0e4xk4rmg5jdkn8aams492a7jlg73ue0gc0ddfj
  console.log("ckb address: ", address);

  const lock = addressToScript(address);
  const emptyCells = await collector.getCells({
    lock,
  });
  if (!emptyCells || emptyCells.length === 0) {
    throw new NoLiveCellError("The address has no empty cells");
  }

  const uniqueCellCapacity = MIN_CAPACITY + BigInt(65) * CKB_UNIT + BigInt(remove0x(xudtInfo).length / 2) * CKB_UNIT;

  let txFee = MAX_FEE;
  const {inputs, sumInputsCapacity} = collector.collectInputs(emptyCells, uniqueCellCapacity, txFee, MIN_CAPACITY);

  const outputs: CKBComponents.CellOutput[] = [
    {
      lock,
      type: {
        ...uniqueTypeScript,
        args: generateUniqueTypeArgs(inputs[0], 0),
      },
      capacity: append0x(uniqueCellCapacity.toString(16)),
    },
  ];

  const changeCapacity = sumInputsCapacity - uniqueCellCapacity - txFee;
  outputs.push({
    lock,
    capacity: append0x(changeCapacity.toString(16)),
  });

  const outputsData = [xudtInfo, "0x"];

  const emptyWitness = {lock: "", inputType: "", outputType: ""};
  const witnesses = inputs.map((_, index) => (index === 0 ? emptyWitness : "0x"));

  const cellDeps = [getSecp256k1CellDep(isMainnet), uniqueCellDep];

  const unsignedTx = {
    version: "0x0",
    cellDeps,
    headerDeps: [],
    inputs,
    outputs,
    outputsData,
    witnesses,
  };

  if (txFee === MAX_FEE) {
    const txSize = getTransactionSize(unsignedTx) + SECP256K1_WITNESS_LOCK_SIZE;
    const estimatedTxFee = calculateTransactionFee(txSize);
    const estimatedChangeCapacity = changeCapacity + (MAX_FEE - estimatedTxFee);
    unsignedTx.outputs[unsignedTx.outputs.length - 1].capacity = append0x(estimatedChangeCapacity.toString(16));
  }

  const signedTx = collector.getCkb().signTransaction(CKB_TEST_PRIVATE_KEY)(unsignedTx);
  const txHash = await collector.getCkb().rpc.sendTransaction(signedTx, "passthrough");
  console.info(`A unique cell has been created with tx hash ${txHash}`);
};

createUniqueCell();
