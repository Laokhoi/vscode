/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ExtensionIdentifier, ExtensionIdentifierSet } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IIssueFormService, IssueReporterData } from '../common/issue.js';
import { IssueReporterEditorInput } from './issueReporterEditorInput.js';

export interface IssuePassData {
	issueTitle: string;
	issueBody: string;
}

export class IssueFormService implements IIssueFormService {

	readonly _serviceBrand: undefined;

	protected currentData: IssueReporterData | undefined;
	protected extensionIdentifierSet: ExtensionIdentifierSet = new ExtensionIdentifierSet();

	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IEditorService protected readonly editorService: IEditorService,
		@IMenuService protected readonly menuService: IMenuService,
		@IContextKeyService protected readonly contextKeyService: IContextKeyService,
		@ILogService protected readonly logService: ILogService,
		@IDialogService protected readonly dialogService: IDialogService,
		@IHostService protected readonly hostService: IHostService
	) { }

	async openReporter(data: IssueReporterData): Promise<void> {
		if (this.hasToReload(data)) {
			return;
		}

		// Open the issue reporter using EditorPane instead of auxiliary window
		const input = IssueReporterEditorInput.getInstance(data);
		await this.editorService.openEditor(input, {
			pinned: true,
			revealIfOpened: true
		});
	}

	async sendReporterMenu(extensionId: string): Promise<IssueReporterData | undefined> {
		const menu = this.menuService.createMenu(MenuId.IssueReporter, this.contextKeyService);

		// render menu and dispose
		const actions = menu.getActions({ renderShortTitle: true }).flatMap(entry => entry[1]);
		for (const action of actions) {
			try {
				if (action.item && 'source' in action.item && action.item.source?.id.toLowerCase() === extensionId.toLowerCase()) {
					this.extensionIdentifierSet.add(extensionId.toLowerCase());
					await action.run();
				}
			} catch (error) {
				console.error(error);
			}
		}

		if (!this.extensionIdentifierSet.has(extensionId)) {
			// send undefined to indicate no action was taken
			return undefined;
		}

		// we found the extension, now we clean up the menu and remove it from the set. This is to ensure that we do duplicate extension identifiers
		this.extensionIdentifierSet.delete(new ExtensionIdentifier(extensionId));
		menu.dispose();

		const result = this.currentData;

		// reset current data.
		this.currentData = undefined;

		return result ?? undefined;
	}

	//#region used by issue reporter

	async closeReporter(): Promise<void> {
		// Close any open issue reporter editors
		const editorPanes = this.editorService.visibleEditorPanes;
		for (const pane of editorPanes) {
			if (pane.input instanceof IssueReporterEditorInput) {
				await pane.group.closeEditor(pane.input);
			}
		}
	}

	async reloadWithExtensionsDisabled(): Promise<void> {
		try {
			await this.hostService.reload({ disableExtensions: true });
		} catch (error) {
			this.logService.error(error);
		}
	}

	async showConfirmCloseDialog(): Promise<void> {
		await this.dialogService.prompt({
			type: Severity.Warning,
			message: localize('confirmCloseIssueReporter', "Your input will not be saved. Are you sure you want to close this window?"),
			buttons: [
				{
					label: localize({ key: 'yes', comment: ['&& denotes a mnemonic'] }, "&&Yes"),
					run: () => {
						this.closeReporter();
					}
				},
				{
					label: localize('cancel', "Cancel"),
					run: () => { }
				}
			]
		});
	}

	async showClipboardDialog(): Promise<boolean> {
		let result = false;

		await this.dialogService.prompt({
			type: Severity.Warning,
			message: localize('issueReporterWriteToClipboard', "There is too much data to send to GitHub directly. The data will be copied to the clipboard, please paste it into the GitHub issue page that is opened."),
			buttons: [
				{
					label: localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
					run: () => { result = true; }
				},
				{
					label: localize('cancel', "Cancel"),
					run: () => { result = false; }
				}
			]
		});

		return result;
	}

	hasToReload(data: IssueReporterData): boolean {
		if (data.extensionId && this.extensionIdentifierSet.has(data.extensionId)) {
			this.currentData = data;
			// Focus existing issue reporter if open
			const input = IssueReporterEditorInput.getInstance(data);
			this.editorService.openEditor(input, { revealIfOpened: true });
			return true;
		}

		// Check if there's already an issue reporter open and focus it
		const editorPanes = this.editorService.visibleEditorPanes;
		for (const pane of editorPanes) {
			if (pane.input instanceof IssueReporterEditorInput) {
				this.editorService.openEditor(pane.input, { revealIfOpened: true });
				return true;
			}
		}

		return false;
	}
}
