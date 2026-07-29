import { getQuickJS, getQuickJSSync, type QuickJSContext } from 'quickjs-emscripten';

const HOOK_ABORT_SIGNAL = '__WBWDB_HOOK_ABORT__';

const quickjsReady: Promise<void> = (async () => {
	await getQuickJS();
})();

function createSandboxVM(): QuickJSContext {
	const QuickJS = getQuickJSSync();
	return QuickJS.newContext();
}

function populateVM(
	vm: QuickJSContext,
	row: Record<string, unknown>,
	oldRow: Record<string, unknown> | null,
	tableName: string,
): void {
	const jsRow = vm.newObject();
	for (const [k, v] of Object.entries(row)) {
		if (v === null || v === undefined) {
			vm.setProp(jsRow, k, vm.null);
		} else if (typeof v === 'number') {
			vm.setProp(jsRow, k, vm.newNumber(v));
		} else if (typeof v === 'boolean') {
			vm.setProp(jsRow, k, vm.newString(v ? 'true' : 'false'));
		} else {
			vm.setProp(jsRow, k, vm.newString(String(v)));
		}
	}
	vm.setProp(vm.global, 'row', jsRow);

	const jsOldRow = oldRow != null ? vm.newObject() : null;
	if (jsOldRow && oldRow) {
		for (const [k, v] of Object.entries(oldRow)) {
			if (v === null || v === undefined) {
				vm.setProp(jsOldRow, k, vm.null);
			} else if (typeof v === 'number') {
				vm.setProp(jsOldRow, k, vm.newNumber(v));
			} else if (typeof v === 'boolean') {
				vm.setProp(jsOldRow, k, vm.newString(v ? 'true' : 'false'));
			} else {
				vm.setProp(jsOldRow, k, vm.newString(String(v)));
			}
		}
	}
	vm.setProp(vm.global, 'oldRow', jsOldRow ?? vm.null);

	vm.setProp(vm.global, 'tableName', vm.newString(tableName));

	const abortResult = vm.evalCode(`(function abort(msg) { throw new Error('__WBWDB_HOOK_ABORT__:' + msg); })`);
	if (!abortResult.error) {
		vm.setProp(vm.global, 'abort', abortResult.value);
		abortResult.value.dispose();
	} else {
		abortResult.error.dispose();
	}

	jsRow.dispose();
	if (jsOldRow) jsOldRow.dispose();
}

function execInSandbox(
	vm: QuickJSContext,
	body: string,
): { ok: boolean; error?: string } {
	const result = vm.evalCode(body);
	if (result.error) {
		const errorVal = vm.dump(result.error);
		result.error.dispose();
		let errorStr: string;
		if (typeof errorVal === 'string') {
			errorStr = errorVal;
		} else if (errorVal && typeof errorVal === 'object' && 'message' in errorVal) {
			errorStr = String((errorVal as { message: unknown }).message);
		} else {
			errorStr = String(errorVal);
		}
		return { ok: false, error: errorStr };
	}
	result.value.dispose();
	return { ok: true };
}

export function runJSHookSandbox(
	hookName: string,
	body: string,
	row: Record<string, unknown>,
	oldRow: Record<string, unknown> | null,
	tableName: string,
): Record<string, unknown> | void {
	let vm: QuickJSContext | null = null;
	try {
		vm = createSandboxVM();
		populateVM(vm, row, oldRow, tableName);
		const outcome = execInSandbox(vm, body);

		if (!outcome.ok && outcome.error) {
			if (outcome.error.includes(HOOK_ABORT_SIGNAL)) {
				throw new Error(HOOK_ABORT_SIGNAL);
			}
			throw new Error(outcome.error);
		}

		// Read back modified row from sandbox
		const rowHandle = vm.getProp(vm.global, 'row');
		const modifiedRow = vm.dump(rowHandle) as Record<string, unknown>;
		rowHandle.dispose();

		// Merge back: copy all properties from modified row to original
		for (const key of Object.keys(row)) {
			if (key === 'id') continue;
			if (key in modifiedRow) {
				row[key] = modifiedRow[key];
			}
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		if (message === HOOK_ABORT_SIGNAL || message.startsWith(HOOK_ABORT_SIGNAL + ':')) {
			const abortErr = new Error(`Hook "${hookName}" blocked the operation`);
			if (err instanceof Error) (abortErr as Error & { cause?: unknown }).cause = err;
			throw abortErr;
		}
		throw err instanceof Error
			? new Error(`Hook "${hookName}" error: ${message}`, { cause: err })
			: new Error(`Hook "${hookName}" error: ${message}`);
	} finally {
		if (vm) try { vm.dispose(); } catch { /* ignore */ }
	}
}

export function runAfterJSHookSandbox(
	hookName: string,
	body: string,
	row: Record<string, unknown>,
	tableName: string,
): void {
	let vm: QuickJSContext | null = null;
	try {
		vm = createSandboxVM();
		populateVM(vm, row, null, tableName);
		const outcome = execInSandbox(vm, body);
		if (!outcome.ok && outcome.error) {
			console.error(`Hook "${hookName}" error: ${outcome.error}`);
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Hook "${hookName}" error: ${message}`);
	} finally {
		if (vm) try { vm.dispose(); } catch { /* ignore */ }
	}
}

export { quickjsReady as initHookSandbox };
