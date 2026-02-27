///<amd-module name="@cxl/spec/a11y.js"/>
import type { Result } from './index.js';

export interface AccessibilityRule {
	//description: string;
	// Return true | false if applicable to node, otherwise void
	test(node: Element): Result[] | void;
}

interface RoleMeta {
	type: Roles[RoleName]['type'];
	allowedAttrs?: readonly AriaAttributeName[];
	requiredAttrs?: readonly AriaAttributeName[];
	superclassRole?: readonly RoleName[];
	accessibleNameRequired?: boolean;
	nameFromContent?: boolean;
	childrenPresentational?: boolean;
}

interface AttributeMeta {
	type: string;
	allowEmpty?: boolean;
	global?: boolean;
	values?: string[];
}

type Roles = typeof ariaRoles;
type RoleName = keyof Roles;
type AriaAttributeName = keyof typeof ariaAttrs;

const ariaRoles = {
	alert: {
		type: 'widget',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
	},
	alertdialog: {
		type: 'widget',
		allowedAttrs: ['aria-expanded', 'aria-modal'],
		superclassRole: ['alert', 'dialog'],
		accessibleNameRequired: true,
	},
	application: {
		// Note: spec difference
		type: 'landmark',
		// Note: aria-expanded is not in the 1.1 spec but is
		// consistently supported in ATs and was added in 1.2
		allowedAttrs: ['aria-activedescendant', 'aria-expanded'],
		superclassRole: ['structure'],
		accessibleNameRequired: true,
	},
	article: {
		type: 'structure',
		allowedAttrs: ['aria-posinset', 'aria-setsize', 'aria-expanded'],
		superclassRole: ['document'],
	},
	banner: {
		type: 'landmark',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['landmark'],
	},
	blockquote: {
		type: 'structure',
		superclassRole: ['section'],
	},
	button: {
		type: 'widget',
		allowedAttrs: ['aria-expanded', 'aria-pressed'],
		superclassRole: ['command'],
		accessibleNameRequired: true,
		nameFromContent: true,
		childrenPresentational: true,
	},
	caption: {
		type: 'structure',
		requiredContext: ['figure', 'table', 'grid', 'treegrid'],
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	cell: {
		type: 'structure',
		requiredContext: ['row'],
		allowedAttrs: [
			'aria-colindex',
			'aria-colspan',
			'aria-rowindex',
			'aria-rowspan',
			'aria-expanded',
		],
		superclassRole: ['section'],
		nameFromContent: true,
	},
	checkbox: {
		type: 'widget',
		// Note: aria-required is not in the 1.1 spec but is
		// consistently supported in ATs and was added in 1.2
		requiredAttrs: ['aria-checked'],
		allowedAttrs: ['aria-readonly', 'aria-required'],
		superclassRole: ['input'],
		accessibleNameRequired: true,
		nameFromContent: true,
		childrenPresentational: true,
	},
	code: {
		type: 'structure',
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	columnheader: {
		type: 'structure',
		requiredContext: ['row'],
		allowedAttrs: [
			'aria-sort',
			'aria-colindex',
			'aria-colspan',
			'aria-expanded',
			'aria-readonly',
			'aria-required',
			'aria-rowindex',
			'aria-rowspan',
			'aria-selected',
		],
		superclassRole: ['cell', 'gridcell', 'sectionhead'],
		// Note: spec difference
		accessibleNameRequired: false,
		nameFromContent: true,
	},
	combobox: {
		type: 'widget',
		requiredAttrs: ['aria-expanded', 'aria-controls'],
		allowedAttrs: [
			'aria-owns',
			'aria-autocomplete',
			'aria-readonly',
			'aria-required',
			'aria-activedescendant',
			'aria-orientation',
		],
		superclassRole: ['select'],
		accessibleNameRequired: true,
	},
	command: {
		type: 'abstract',
		superclassRole: ['widget'],
	},
	complementary: {
		type: 'landmark',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['landmark'],
	},
	composite: {
		type: 'abstract',
		superclassRole: ['widget'],
	},
	contentinfo: {
		type: 'landmark',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['landmark'],
	},
	comment: {
		type: 'structure',
		allowedAttrs: ['aria-level', 'aria-posinset', 'aria-setsize'],
		superclassRole: ['article'],
	},
	definition: {
		type: 'structure',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
	},
	deletion: {
		type: 'structure',
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	dialog: {
		type: 'widget',
		allowedAttrs: ['aria-expanded', 'aria-modal'],
		superclassRole: ['window'],
		accessibleNameRequired: true,
	},
	directory: {
		type: 'structure',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['list'],
		// Note: spec difference
		nameFromContent: true,
	},
	document: {
		type: 'structure',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['structure'],
	},
	emphasis: {
		type: 'structure',
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	feed: {
		type: 'structure',
		requiredOwned: ['article'],
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['list'],
	},
	figure: {
		type: 'structure',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
		// Note: spec difference
		nameFromContent: true,
	},
	form: {
		type: 'landmark',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['landmark'],
	},
	grid: {
		type: 'composite',
		requiredOwned: ['rowgroup', 'row'],
		allowedAttrs: [
			'aria-level',
			'aria-multiselectable',
			'aria-readonly',
			'aria-activedescendant',
			'aria-colcount',
			'aria-expanded',
			'aria-rowcount',
		],
		superclassRole: ['composite', 'table'],
		// Note: spec difference
		accessibleNameRequired: false,
	},
	gridcell: {
		type: 'widget',
		requiredContext: ['row'],
		allowedAttrs: [
			'aria-readonly',
			'aria-required',
			'aria-selected',
			'aria-colindex',
			'aria-colspan',
			'aria-expanded',
			'aria-rowindex',
			'aria-rowspan',
		],
		superclassRole: ['cell', 'widget'],
		nameFromContent: true,
	},
	group: {
		type: 'structure',
		allowedAttrs: ['aria-activedescendant', 'aria-expanded'],
		superclassRole: ['section'],
	},
	heading: {
		type: 'structure',
		requiredAttrs: ['aria-level'],
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['sectionhead'],
		// Note: spec difference
		accessibleNameRequired: false,
		nameFromContent: true,
	},
	img: {
		type: 'structure',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
		accessibleNameRequired: true,
		childrenPresentational: true,
	},
	input: {
		type: 'abstract',
		superclassRole: ['widget'],
	},
	insertion: {
		type: 'structure',
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	landmark: {
		type: 'abstract',
		superclassRole: ['section'],
	},
	link: {
		type: 'widget',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['command'],
		accessibleNameRequired: true,
		nameFromContent: true,
	},
	list: {
		type: 'structure',
		requiredOwned: ['listitem'],
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
	},
	listbox: {
		type: 'widget',
		requiredOwned: ['group', 'option'],
		allowedAttrs: [
			'aria-multiselectable',
			'aria-readonly',
			'aria-required',
			'aria-activedescendant',
			'aria-expanded',
			'aria-orientation',
		],
		superclassRole: ['select'],
		accessibleNameRequired: true,
	},
	listitem: {
		type: 'structure',
		requiredContext: ['list'],
		allowedAttrs: [
			'aria-level',
			'aria-posinset',
			'aria-setsize',
			'aria-expanded',
		],
		superclassRole: ['section'],
		// Note: spec difference
		nameFromContent: true,
	},
	log: {
		type: 'widget',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
	},
	main: {
		type: 'landmark',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['landmark'],
	},
	marquee: {
		type: 'widget',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
	},
	math: {
		type: 'structure',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
		childrenPresentational: true,
	},
	menu: {
		type: 'composite',
		// Note: spec difference (menu & separator as required owned)
		requiredOwned: [
			'group',
			'menuitemradio',
			'menuitem',
			'menuitemcheckbox',
			'menu',
			'separator',
		],
		allowedAttrs: [
			'aria-activedescendant',
			'aria-expanded',
			'aria-orientation',
		],
		superclassRole: ['select'],
	},
	menubar: {
		type: 'composite',
		// Note: spec difference (menu & separator as required owned)
		requiredOwned: [
			'group',
			'menuitemradio',
			'menuitem',
			'menuitemcheckbox',
			'menu',
			'separator',
		],
		allowedAttrs: [
			'aria-activedescendant',
			'aria-expanded',
			'aria-orientation',
		],
		superclassRole: ['menu'],
	},
	menuitem: {
		type: 'widget',
		requiredContext: ['menu', 'menubar', 'group'],
		// Note: aria-expanded is not in the 1.1 spec but is
		// consistently supported in ATs and was added in 1.2
		allowedAttrs: ['aria-posinset', 'aria-setsize', 'aria-expanded'],
		superclassRole: ['command'],
		accessibleNameRequired: true,
		nameFromContent: true,
	},
	menuitemcheckbox: {
		type: 'widget',
		requiredContext: ['menu', 'menubar', 'group'],
		requiredAttrs: ['aria-checked'],
		allowedAttrs: ['aria-posinset', 'aria-readonly', 'aria-setsize'],
		superclassRole: ['checkbox', 'menuitem'],
		accessibleNameRequired: true,
		nameFromContent: true,
		childrenPresentational: true,
	},
	menuitemradio: {
		type: 'widget',
		requiredContext: ['menu', 'menubar', 'group'],
		requiredAttrs: ['aria-checked'],
		allowedAttrs: ['aria-posinset', 'aria-readonly', 'aria-setsize'],
		superclassRole: ['menuitemcheckbox', 'radio'],
		accessibleNameRequired: true,
		nameFromContent: true,
		childrenPresentational: true,
	},
	meter: {
		type: 'structure',
		requiredAttrs: ['aria-valuenow'],
		allowedAttrs: ['aria-valuemax', 'aria-valuemin', 'aria-valuetext'],
		superclassRole: ['range'],
		accessibleNameRequired: true,
		childrenPresentational: true,
	},
	mark: {
		type: 'structure',
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	navigation: {
		type: 'landmark',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['landmark'],
	},
	none: {
		type: 'structure',
		superclassRole: ['structure'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	note: {
		type: 'structure',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
	},
	option: {
		type: 'widget',
		requiredContext: ['group', 'listbox'],
		// Note: since the option role has an implicit
		// aria-selected value it is not required to be added by
		// the user
		allowedAttrs: [
			'aria-selected',
			'aria-checked',
			'aria-posinset',
			'aria-setsize',
		],
		superclassRole: ['input'],
		accessibleNameRequired: true,
		nameFromContent: true,
		childrenPresentational: true,
	},
	paragraph: {
		type: 'structure',
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	presentation: {
		type: 'structure',
		superclassRole: ['structure'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	progressbar: {
		type: 'widget',
		allowedAttrs: [
			'aria-expanded',
			'aria-valuemax',
			'aria-valuemin',
			'aria-valuenow',
			'aria-valuetext',
		],
		superclassRole: ['range'],
		accessibleNameRequired: true,
		childrenPresentational: true,
	},
	radio: {
		type: 'widget',
		// Note: aria-required is not in the 1.1 or 1.2 specs but is
		// consistently supported in ATs on the individual radio element
		requiredAttrs: ['aria-checked'],
		allowedAttrs: ['aria-posinset', 'aria-setsize', 'aria-required'],
		superclassRole: ['input'],
		accessibleNameRequired: true,
		nameFromContent: true,
		childrenPresentational: true,
	},
	radiogroup: {
		type: 'composite',
		// Note: spec difference (no required owned)
		allowedAttrs: [
			'aria-readonly',
			'aria-required',
			'aria-activedescendant',
			'aria-expanded',
			'aria-orientation',
		],
		superclassRole: ['select'],
		// Note: spec difference
		accessibleNameRequired: false,
	},
	range: {
		type: 'abstract',
		superclassRole: ['widget'],
	},
	region: {
		type: 'landmark',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['landmark'],
		// Note: spec difference
		accessibleNameRequired: false,
	},
	roletype: {
		type: 'abstract',
		superclassRole: [],
	},
	row: {
		type: 'structure',
		requiredContext: ['grid', 'rowgroup', 'table', 'treegrid'],
		requiredOwned: ['cell', 'columnheader', 'gridcell', 'rowheader'],
		allowedAttrs: [
			'aria-colindex',
			'aria-level',
			'aria-rowindex',
			'aria-selected',
			'aria-activedescendant',
			'aria-expanded',
			'aria-posinset',
			'aria-setsize',
		],
		superclassRole: ['group', 'widget'],
		nameFromContent: true,
	},
	rowgroup: {
		type: 'structure',
		requiredContext: ['grid', 'table', 'treegrid'],
		requiredOwned: ['row'],
		superclassRole: ['structure'],
		nameFromContent: true,
	},
	rowheader: {
		type: 'structure',
		requiredContext: ['row'],
		allowedAttrs: [
			'aria-sort',
			'aria-colindex',
			'aria-colspan',
			'aria-expanded',
			'aria-readonly',
			'aria-required',
			'aria-rowindex',
			'aria-rowspan',
			'aria-selected',
		],
		superclassRole: ['cell', 'gridcell', 'sectionhead'],
		// Note: spec difference
		accessibleNameRequired: false,
		nameFromContent: true,
	},
	scrollbar: {
		type: 'widget',
		requiredAttrs: ['aria-valuenow'],
		// Note: since the scrollbar role has implicit
		// aria-orientation, aria-valuemax, aria-valuemin values it
		// is not required to be added by the user
		//
		// Note: because aria-controls is not well supported we will not
		// make it a required attribute even though it is required in the
		// spec
		allowedAttrs: [
			'aria-controls',
			'aria-orientation',
			'aria-valuemax',
			'aria-valuemin',
			'aria-valuetext',
		],
		superclassRole: ['range'],
		childrenPresentational: true,
	},
	search: {
		type: 'landmark',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['landmark'],
	},
	searchbox: {
		type: 'widget',
		allowedAttrs: [
			'aria-activedescendant',
			'aria-autocomplete',
			'aria-multiline',
			'aria-placeholder',
			'aria-readonly',
			'aria-required',
		],
		superclassRole: ['textbox'],
		accessibleNameRequired: true,
	},
	section: {
		type: 'abstract',
		superclassRole: ['structure'],
		// Note: spec difference
		nameFromContent: true,
	},
	sectionhead: {
		type: 'abstract',
		superclassRole: ['structure'],
		// Note: spec difference
		nameFromContent: true,
	},
	select: {
		type: 'abstract',
		superclassRole: ['composite', 'group'],
	},
	separator: {
		type: 'structure',
		//requiredAttrs: [],
		// Note: since the separator role has implicit
		// aria-orientation, aria-valuemax, aria-valuemin, and
		// values it is not required to be added by
		// the user
		allowedAttrs: [
			'aria-valuenow',
			'aria-valuemax',
			'aria-valuemin',
			'aria-orientation',
			'aria-valuetext',
		],
		superclassRole: ['structure', 'widget'],
		childrenPresentational: true,
	},
	slider: {
		type: 'widget',
		requiredAttrs: ['aria-valuenow'],
		// Note: since the slider role has implicit
		// aria-orientation, aria-valuemax, aria-valuemin values it
		// is not required to be added by the user
		allowedAttrs: [
			'aria-valuemax',
			'aria-valuemin',
			'aria-orientation',
			'aria-readonly',
			'aria-valuetext',
		],
		superclassRole: ['input', 'range'],
		accessibleNameRequired: true,
		childrenPresentational: true,
	},
	spinbutton: {
		type: 'widget',
		// Note: since the spinbutton role has implicit
		// aria-valuenow, aria-valuemax, aria-valuemin values it
		// is not required to be added by the user
		allowedAttrs: [
			'aria-valuemax',
			'aria-valuemin',
			'aria-readonly',
			'aria-required',
			'aria-activedescendant',
			'aria-valuetext',
			'aria-valuenow',
		],
		superclassRole: ['composite', 'input', 'range'],
		accessibleNameRequired: true,
	},
	status: {
		type: 'widget',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
	},
	strong: {
		type: 'structure',
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	structure: {
		type: 'abstract',
		superclassRole: ['roletype'],
	},
	subscript: {
		type: 'structure',
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	superscript: {
		type: 'structure',
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	switch: {
		type: 'widget',
		requiredAttrs: ['aria-checked'],
		allowedAttrs: ['aria-readonly'],
		superclassRole: ['checkbox'],
		accessibleNameRequired: true,
		nameFromContent: true,
		childrenPresentational: true,
	},
	suggestion: {
		type: 'structure',
		requiredOwned: ['insertion', 'deletion'],
		superclassRole: ['section'],
		prohibitedAttrs: ['aria-label', 'aria-labelledby'],
	},
	tab: {
		type: 'widget',
		requiredContext: ['tablist'],
		allowedAttrs: [
			'aria-posinset',
			'aria-selected',
			'aria-setsize',
			'aria-expanded',
		],
		superclassRole: ['sectionhead', 'widget'],
		nameFromContent: true,
		childrenPresentational: true,
	},
	table: {
		type: 'structure',
		requiredOwned: ['rowgroup', 'row'],
		allowedAttrs: ['aria-colcount', 'aria-rowcount', 'aria-expanded'],
		// NOTE: although the spec says this is not named from contents,
		// the accessible text acceptance tests (#139 and #140) require
		// table be named from content (we even had to special case
		// table in commons/aria/named-from-contents)
		superclassRole: ['section'],
		// Note: spec difference
		accessibleNameRequired: false,
		nameFromContent: true,
	},
	tablist: {
		type: 'composite',
		requiredOwned: ['tab'],
		// NOTE: aria-expanded is from the 1.0 spec but is still
		// consistently supported in ATs
		allowedAttrs: [
			'aria-level',
			'aria-multiselectable',
			'aria-orientation',
			'aria-activedescendant',
			'aria-expanded',
		],
		superclassRole: ['composite'],
	},
	tabpanel: {
		type: 'widget',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
		// Note: spec difference
		accessibleNameRequired: false,
	},
	term: {
		type: 'structure',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
		// Note: spec difference
		nameFromContent: true,
	},
	text: {
		type: 'structure',
		superclassRole: ['section'],
		nameFromContent: true,
	},
	textbox: {
		type: 'widget',
		allowedAttrs: [
			'aria-activedescendant',
			'aria-autocomplete',
			'aria-multiline',
			'aria-placeholder',
			'aria-readonly',
			'aria-required',
		],
		superclassRole: ['input'],
		accessibleNameRequired: true,
	},
	time: {
		type: 'structure',
		superclassRole: ['section'],
	},
	timer: {
		type: 'widget',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['status'],
	},
	toolbar: {
		type: 'structure',
		allowedAttrs: [
			'aria-orientation',
			'aria-activedescendant',
			'aria-expanded',
		],
		superclassRole: ['group'],
		accessibleNameRequired: true,
	},
	tooltip: {
		type: 'structure',
		allowedAttrs: ['aria-expanded'],
		superclassRole: ['section'],
		nameFromContent: true,
	},
	tree: {
		type: 'composite',
		requiredOwned: ['group', 'treeitem'],
		allowedAttrs: [
			'aria-multiselectable',
			'aria-required',
			'aria-activedescendant',
			'aria-expanded',
			'aria-orientation',
		],
		superclassRole: ['select'],
		// Note: spec difference
		accessibleNameRequired: false,
	},
	treegrid: {
		type: 'composite',
		requiredOwned: ['rowgroup', 'row'],
		allowedAttrs: [
			'aria-activedescendant',
			'aria-colcount',
			'aria-expanded',
			'aria-level',
			'aria-multiselectable',
			'aria-orientation',
			'aria-readonly',
			'aria-required',
			'aria-rowcount',
		],
		superclassRole: ['grid', 'tree'],
		// Note: spec difference
		accessibleNameRequired: false,
	},
	treeitem: {
		type: 'widget',
		requiredContext: ['group', 'tree'],
		allowedAttrs: [
			'aria-checked',
			'aria-expanded',
			'aria-level',
			'aria-posinset',
			'aria-selected',
			'aria-setsize',
		],
		superclassRole: ['listitem', 'option'],
		accessibleNameRequired: true,
		nameFromContent: true,
	},
	widget: {
		type: 'abstract',
		superclassRole: ['roletype'],
	},
	window: {
		type: 'abstract',
		superclassRole: ['roletype'],
	},
} as const;

const ariaAttrs = {
	'aria-activedescendant': {
		type: 'idref',
		allowEmpty: true,
	},
	'aria-atomic': {
		type: 'boolean',
		global: true,
	},
	'aria-autocomplete': {
		type: 'nmtoken',
		values: ['inline', 'list', 'both', 'none'],
	},
	'aria-busy': {
		type: 'boolean',
		global: true,
	},
	'aria-checked': {
		type: 'nmtoken',
		values: ['false', 'mixed', 'true', 'undefined'],
	},
	'aria-colcount': {
		type: 'int',
		minValue: -1,
	},
	'aria-colindex': {
		type: 'int',
		minValue: 1,
	},
	'aria-colspan': {
		type: 'int',
		minValue: 1,
	},
	'aria-controls': {
		type: 'idrefs',
		allowEmpty: true,
		global: true,
	},
	'aria-current': {
		type: 'nmtoken',
		allowEmpty: true,
		values: ['page', 'step', 'location', 'date', 'time', 'true', 'false'],
		global: true,
	},
	'aria-describedby': {
		type: 'idrefs',
		allowEmpty: true,
		global: true,
	},
	'aria-details': {
		type: 'idref',
		allowEmpty: true,
		global: true,
	},
	'aria-disabled': {
		type: 'boolean',
		global: true,
	},
	'aria-dropeffect': {
		type: 'nmtokens',
		values: ['copy', 'execute', 'link', 'move', 'none', 'popup'],
		global: true,
	},
	'aria-errormessage': {
		type: 'idref',
		allowEmpty: true,
		global: true,
	},
	'aria-expanded': {
		type: 'nmtoken',
		values: ['true', 'false', 'undefined'],
	},
	'aria-flowto': {
		type: 'idrefs',
		allowEmpty: true,
		global: true,
	},
	'aria-grabbed': {
		type: 'nmtoken',
		values: ['true', 'false', 'undefined'],
		global: true,
	},
	'aria-haspopup': {
		type: 'nmtoken',
		allowEmpty: true,
		values: ['true', 'false', 'menu', 'listbox', 'tree', 'grid', 'dialog'],
		global: true,
	},
	'aria-hidden': {
		type: 'nmtoken',
		values: ['true', 'false', 'undefined'],
		global: true,
	},
	'aria-invalid': {
		type: 'nmtoken',
		values: ['grammar', 'false', 'spelling', 'true'],
		global: true,
	},
	'aria-keyshortcuts': {
		type: 'string',
		allowEmpty: true,
		global: true,
	},
	'aria-label': {
		type: 'string',
		allowEmpty: true,
		global: true,
	},
	'aria-labelledby': {
		type: 'idrefs',
		allowEmpty: true,
		global: true,
	},
	'aria-level': {
		type: 'int',
		minValue: 1,
	},
	'aria-live': {
		type: 'nmtoken',
		values: ['assertive', 'off', 'polite'],
		global: true,
	},
	'aria-modal': {
		type: 'boolean',
	},
	'aria-multiline': {
		type: 'boolean',
	},
	'aria-multiselectable': {
		type: 'boolean',
	},
	'aria-orientation': {
		type: 'nmtoken',
		values: ['horizontal', 'undefined', 'vertical'],
	},
	'aria-owns': {
		type: 'idrefs',
		allowEmpty: true,
		global: true,
	},
	'aria-placeholder': {
		type: 'string',
		allowEmpty: true,
	},
	'aria-posinset': {
		type: 'int',
		minValue: 1,
	},
	'aria-pressed': {
		type: 'nmtoken',
		values: ['false', 'mixed', 'true', 'undefined'],
	},
	'aria-readonly': {
		type: 'boolean',
	},
	'aria-relevant': {
		type: 'nmtokens',
		values: ['additions', 'all', 'removals', 'text'],
		global: true,
	},
	'aria-required': {
		type: 'boolean',
	},
	'aria-roledescription': {
		type: 'string',
		allowEmpty: true,
		global: true,
	},
	'aria-rowcount': {
		type: 'int',
		minValue: -1,
	},
	'aria-rowindex': {
		type: 'int',
		minValue: 1,
	},
	'aria-rowspan': {
		type: 'int',
		minValue: 0,
	},
	'aria-selected': {
		type: 'nmtoken',
		values: ['false', 'true', 'undefined'],
	},
	'aria-setsize': {
		type: 'int',
		minValue: -1,
	},
	'aria-sort': {
		type: 'nmtoken',
		values: ['ascending', 'descending', 'none', 'other'],
	},
	'aria-valuemax': {
		type: 'decimal',
	},
	'aria-valuemin': {
		type: 'decimal',
	},
	'aria-valuenow': {
		type: 'decimal',
	},
	'aria-valuetext': {
		type: 'string',
	},
} as const;

const htmlElms = {
	a: {
		// Note: variants work by matching the node against the
		// `matches` attribute. if the variant matches AND has the
		// desired property (contentTypes, etc.) then we use it,
		// otherwise we move on to the next matching variant
		variant: {
			href: {
				matches: '[href]',
				contentTypes: ['interactive', 'phrasing', 'flow'],
				allowedRoles: [
					'button',
					'checkbox',
					'menuitem',
					'menuitemcheckbox',
					'menuitemradio',
					'option',
					'radio',
					'switch',
					'tab',
					'treeitem',
					'doc-backlink',
					'doc-biblioref',
					'doc-glossref',
					'doc-noteref',
				],
				namingMethods: ['subtreeText'],
			},
			// Note: the default variant is a special variant and is
			// used as the last match if none of the other variants
			// match or have the desired attribute
			default: {
				contentTypes: ['phrasing', 'flow'],
				allowedRoles: true,
			},
		},
	},
	abbr: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	address: {
		contentTypes: ['flow'],
		allowedRoles: true,
	},
	area: {
		variant: {
			href: {
				matches: '[href]',
				allowedRoles: false,
			},
			default: {
				allowedRoles: ['button', 'link'],
			},
		},
		contentTypes: ['phrasing', 'flow'],
		namingMethods: ['altText'],
	},
	article: {
		contentTypes: ['sectioning', 'flow'],
		allowedRoles: [
			'feed',
			'presentation',
			'none',
			'document',
			'application',
			'main',
			'region',
		],
		shadowRoot: true,
	},
	aside: {
		contentTypes: ['sectioning', 'flow'],
		allowedRoles: [
			'feed',
			'note',
			'presentation',
			'none',
			'region',
			'search',
			'doc-dedication',
			'doc-example',
			'doc-footnote',
			'doc-pullquote',
			'doc-tip',
		],
	},
	audio: {
		variant: {
			controls: {
				matches: '[controls]',
				contentTypes: ['interactive', 'embedded', 'phrasing', 'flow'],
			},
			default: {
				contentTypes: ['embedded', 'phrasing', 'flow'],
			},
		},
		// Note: if the property applies regardless of variants it is
		// placed at the top level instead of the default variant
		allowedRoles: ['application'],
		chromiumRole: 'Audio',
	},
	b: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	base: {
		allowedRoles: false,
		noAriaAttrs: true,
	},
	bdi: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	bdo: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	blockquote: {
		contentTypes: ['flow'],
		allowedRoles: true,
		shadowRoot: true,
	},
	body: {
		allowedRoles: false,
		shadowRoot: true,
	},
	br: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: ['presentation', 'none'],
		namingMethods: ['titleText', 'singleSpace'],
	},
	button: {
		contentTypes: ['interactive', 'phrasing', 'flow'],
		allowedRoles: [
			'checkbox',
			'combobox',
			'link',
			'menuitem',
			'menuitemcheckbox',
			'menuitemradio',
			'option',
			'radio',
			'switch',
			'tab',
		],
		// 5.4 button Element
		namingMethods: ['subtreeText'],
	},
	canvas: {
		allowedRoles: true,
		contentTypes: ['embedded', 'phrasing', 'flow'],
		chromiumRole: 'Canvas',
	},
	caption: {
		allowedRoles: false,
	},
	cite: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	code: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	col: {
		allowedRoles: false,
		noAriaAttrs: true,
	},
	colgroup: {
		allowedRoles: false,
		noAriaAttrs: true,
	},
	data: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	datalist: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: false,
		implicitAttrs: {
			// Note: even though the value of aria-multiselectable is based
			// on the attributes, we don't currently need to know the
			// precise value. however, this allows us to make the attribute
			// future proof in case we ever do need to know it
			'aria-multiselectable': 'false',
		},
	},
	dd: {
		allowedRoles: false,
	},
	del: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	dfn: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	details: {
		contentTypes: ['interactive', 'flow'],
		allowedRoles: false,
	},
	dialog: {
		contentTypes: ['flow'],
		allowedRoles: ['alertdialog'],
	},
	div: {
		contentTypes: ['flow'],
		allowedRoles: true,
		shadowRoot: true,
	},
	dl: {
		contentTypes: ['flow'],
		allowedRoles: ['group', 'list', 'presentation', 'none'],
		chromiumRole: 'DescriptionList',
	},
	dt: {
		allowedRoles: ['listitem'],
	},
	em: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	embed: {
		contentTypes: ['interactive', 'embedded', 'phrasing', 'flow'],
		allowedRoles: [
			'application',
			'document',
			'img',
			'presentation',
			'none',
		],
		chromiumRole: 'EmbeddedObject',
	},
	fieldset: {
		contentTypes: ['flow'],
		allowedRoles: ['none', 'presentation', 'radiogroup'],
		// 5.5 fieldset and legend Elements
		namingMethods: ['fieldsetLegendText'],
	},
	figcaption: {
		allowedRoles: ['group', 'none', 'presentation'],
	},
	figure: {
		contentTypes: ['flow'],
		// Note: technically you're allowed no role when a figcaption
		// descendant, but we can't match that so we'll go with any role
		allowedRoles: true,
		// 5.9 figure and figcaption Elements
		namingMethods: ['figureText', 'titleText'],
	},
	footer: {
		contentTypes: ['flow'],
		allowedRoles: ['group', 'none', 'presentation', 'doc-footnote'],
		shadowRoot: true,
	},
	form: {
		contentTypes: ['flow'],
		allowedRoles: ['search', 'none', 'presentation'],
	},
	h1: {
		contentTypes: ['heading', 'flow'],
		allowedRoles: ['none', 'presentation', 'tab', 'doc-subtitle'],
		shadowRoot: true,
		implicitAttrs: {
			'aria-level': '1',
		},
	},
	h2: {
		contentTypes: ['heading', 'flow'],
		allowedRoles: ['none', 'presentation', 'tab', 'doc-subtitle'],
		shadowRoot: true,
		implicitAttrs: {
			'aria-level': '2',
		},
	},
	h3: {
		contentTypes: ['heading', 'flow'],
		allowedRoles: ['none', 'presentation', 'tab', 'doc-subtitle'],
		shadowRoot: true,
		implicitAttrs: {
			'aria-level': '3',
		},
	},
	h4: {
		contentTypes: ['heading', 'flow'],
		allowedRoles: ['none', 'presentation', 'tab', 'doc-subtitle'],
		shadowRoot: true,
		implicitAttrs: {
			'aria-level': '4',
		},
	},
	h5: {
		contentTypes: ['heading', 'flow'],
		allowedRoles: ['none', 'presentation', 'tab', 'doc-subtitle'],
		shadowRoot: true,
		implicitAttrs: {
			'aria-level': '5',
		},
	},
	h6: {
		contentTypes: ['heading', 'flow'],
		allowedRoles: ['none', 'presentation', 'tab', 'doc-subtitle'],
		shadowRoot: true,
		implicitAttrs: {
			'aria-level': '6',
		},
	},
	head: {
		allowedRoles: false,
		noAriaAttrs: true,
	},
	header: {
		contentTypes: ['flow'],
		allowedRoles: ['group', 'none', 'presentation', 'doc-footnote'],
		shadowRoot: true,
	},
	hgroup: {
		contentTypes: ['heading', 'flow'],
		allowedRoles: true,
	},
	hr: {
		contentTypes: ['flow'],
		allowedRoles: ['none', 'presentation', 'doc-pagebreak'],
		namingMethods: ['titleText', 'singleSpace'],
	},
	html: {
		allowedRoles: false,
		noAriaAttrs: true,
	},
	i: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	iframe: {
		contentTypes: ['interactive', 'embedded', 'phrasing', 'flow'],
		allowedRoles: [
			'application',
			'document',
			'img',
			'none',
			'presentation',
		],
		chromiumRole: 'Iframe',
	},
	img: {
		variant: {
			nonEmptyAlt: {
				matches: [
					{
						// Because <img role="none" alt="foo" /> has no accessible name:
						attributes: {
							alt: '/.+/',
						},
					},
					{
						hasAccessibleName: true,
					},
				],
				allowedRoles: [
					'button',
					'checkbox',
					'link',
					'menuitem',
					'menuitemcheckbox',
					'menuitemradio',
					'option',
					'progressbar',
					'radio',
					'scrollbar',
					'separator',
					'slider',
					'switch',
					'tab',
					'treeitem',
					'doc-cover',
				],
			},
			usemap: {
				matches: '[usemap]',
				contentTypes: ['interactive', 'embedded', 'flow'],
			},
			default: {
				// Note: allow role presentation and none on image with no
				// alt as a way to prevent axe from flagging the image as
				// needing an alt
				allowedRoles: ['presentation', 'none'],
				// Note: spec change (do not count as phrasing), because browsers
				// insert a space between an img's accessible name and other
				// elements' accessible names
				contentTypes: ['embedded', 'flow'],
			},
		},
		// 5.10 img Element
		namingMethods: ['altText'],
	},
	input: {
		variant: {
			button: {
				matches: {
					properties: {
						type: 'button',
					},
				},
				allowedRoles: [
					'checkbox',
					'combobox',
					'link',
					'menuitem',
					'menuitemcheckbox',
					'menuitemradio',
					'option',
					'radio',
					'switch',
					'tab',
				],
			},
			// 5.2 input type="button", input type="submit" and input type="reset"
			buttonType: {
				matches: {
					properties: {
						type: ['button', 'submit', 'reset'],
					},
				},
				namingMethods: ['valueText', 'titleText', 'buttonDefaultText'],
			},
			checkboxPressed: {
				matches: {
					properties: {
						type: 'checkbox',
					},
					attributes: {
						'aria-pressed': '/.*/',
					},
				},
				allowedRoles: [
					'button',
					'menuitemcheckbox',
					'option',
					'switch',
				],
				implicitAttrs: {
					'aria-checked': 'false',
				},
			},
			checkbox: {
				matches: {
					properties: {
						type: 'checkbox',
					},
					attributes: {
						'aria-pressed': null,
					},
				},
				allowedRoles: ['menuitemcheckbox', 'option', 'switch'],
				implicitAttrs: {
					'aria-checked': 'false',
				},
			},
			noRoles: {
				matches: {
					properties: {
						// Note: types of url, search, tel, and email are listed
						// as not allowed roles however since they are text
						// types they should be allowed to have role=combobox
						type: [
							'color',
							'date',
							'datetime-local',
							'file',
							'month',
							'number',
							'password',
							'range',
							'reset',
							'submit',
							'time',
							'week',
						],
					},
				},
				allowedRoles: false,
			},
			hidden: {
				matches: {
					properties: {
						type: 'hidden',
					},
				},
				// Note: spec change (do not count as phrasing)
				contentTypes: ['flow'],
				allowedRoles: false,
				noAriaAttrs: true,
			},
			image: {
				matches: {
					properties: {
						type: 'image',
					},
				},
				allowedRoles: [
					'link',
					'menuitem',
					'menuitemcheckbox',
					'menuitemradio',
					'radio',
					'switch',
				],
				// 5.3 input type="image"
				namingMethods: [
					'altText',
					'valueText',
					'labelText',
					'titleText',
					'buttonDefaultText',
				],
			},
			radio: {
				matches: {
					properties: {
						type: 'radio',
					},
				},
				allowedRoles: ['menuitemradio'],
				implicitAttrs: {
					'aria-checked': 'false',
				},
			},
			textWithList: {
				matches: {
					properties: {
						type: 'text',
					},
					attributes: {
						list: '/.*/',
					},
				},
				allowedRoles: false,
			},
			default: {
				// Note: spec change (do not count as phrasing)
				contentTypes: ['interactive', 'flow'],
				allowedRoles: ['combobox', 'searchbox', 'spinbutton'],
				implicitAttrs: {
					'aria-valuenow': '',
				},
				// 5.1 input type="text", input type="password", input type="search", input type="tel", input type="url"
				// 5.7 Other Form Elements
				namingMethods: ['labelText', 'placeholderText'],
			},
		},
	},
	ins: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	kbd: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	label: {
		contentTypes: ['interactive', 'phrasing', 'flow'],
		allowedRoles: false,
		chromiumRole: 'Label',
	},
	legend: {
		allowedRoles: false,
	},
	li: {
		allowedRoles: [
			'menuitem',
			'menuitemcheckbox',
			'menuitemradio',
			'option',
			'none',
			'presentation',
			'radio',
			'separator',
			'tab',
			'treeitem',
			'doc-biblioentry',
			'doc-endnote',
		],
		implicitAttrs: {
			'aria-setsize': '1',
			'aria-posinset': '1',
		},
	},
	link: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: false,
		noAriaAttrs: true,
	},
	main: {
		contentTypes: ['flow'],
		allowedRoles: false,
		shadowRoot: true,
	},
	map: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: false,
		noAriaAttrs: true,
	},
	math: {
		contentTypes: ['embedded', 'phrasing', 'flow'],
		allowedRoles: false,
	},
	mark: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	menu: {
		contentTypes: ['flow'],
		allowedRoles: [
			'directory',
			'group',
			'listbox',
			'menu',
			'menubar',
			'none',
			'presentation',
			'radiogroup',
			'tablist',
			'toolbar',
			'tree',
		],
	},
	meta: {
		variant: {
			itemprop: {
				matches: '[itemprop]',
				contentTypes: ['phrasing', 'flow'],
			},
		},
		allowedRoles: false,
		noAriaAttrs: true,
	},
	meter: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: false,
		chromiumRole: 'progressbar',
	},
	nav: {
		contentTypes: ['sectioning', 'flow'],
		allowedRoles: [
			'doc-index',
			'doc-pagelist',
			'doc-toc',
			'menu',
			'menubar',
			'none',
			'presentation',
			'tablist',
		],
		shadowRoot: true,
	},
	noscript: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: false,
		noAriaAttrs: true,
	},
	object: {
		variant: {
			usemap: {
				matches: '[usemap]',
				contentTypes: ['interactive', 'embedded', 'phrasing', 'flow'],
			},
			default: {
				contentTypes: ['embedded', 'phrasing', 'flow'],
			},
		},
		allowedRoles: ['application', 'document', 'img'],
		chromiumRole: 'PluginObject',
	},
	ol: {
		contentTypes: ['flow'],
		allowedRoles: [
			'directory',
			'group',
			'listbox',
			'menu',
			'menubar',
			'none',
			'presentation',
			'radiogroup',
			'tablist',
			'toolbar',
			'tree',
		],
	},
	optgroup: {
		allowedRoles: false,
	},
	option: {
		allowedRoles: false,
		implicitAttrs: {
			'aria-selected': 'false',
		},
	},
	output: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
		// 5.6 output Element
		namingMethods: ['subtreeText'],
	},
	p: {
		contentTypes: ['flow'],
		allowedRoles: true,
		shadowRoot: true,
	},
	param: {
		allowedRoles: false,
		noAriaAttrs: true,
	},
	picture: {
		// Note: spec change (do not count as embedded), because browsers do not hide text inside the picture element
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: false,
		noAriaAttrs: true,
	},
	pre: {
		contentTypes: ['flow'],
		allowedRoles: true,
	},
	progress: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: false,
		implicitAttrs: {
			'aria-valuemax': '100',
			'aria-valuemin': '0',
			'aria-valuenow': '0',
		},
	},
	q: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	rp: {
		allowedRoles: true,
	},
	rt: {
		allowedRoles: true,
	},
	ruby: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	s: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	samp: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	script: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: false,
		noAriaAttrs: true,
	},
	section: {
		contentTypes: ['sectioning', 'flow'],
		allowedRoles: [
			'alert',
			'alertdialog',
			'application',
			'banner',
			'complementary',
			'contentinfo',
			'dialog',
			'document',
			'feed',
			'group',
			'log',
			'main',
			'marquee',
			'navigation',
			'none',
			'note',
			'presentation',
			'search',
			'status',
			'tabpanel',
			'doc-abstract',
			'doc-acknowledgments',
			'doc-afterword',
			'doc-appendix',
			'doc-bibliography',
			'doc-chapter',
			'doc-colophon',
			'doc-conclusion',
			'doc-credit',
			'doc-credits',
			'doc-dedication',
			'doc-endnotes',
			'doc-epigraph',
			'doc-epilogue',
			'doc-errata',
			'doc-example',
			'doc-foreword',
			'doc-glossary',
			'doc-index',
			'doc-introduction',
			'doc-notice',
			'doc-pagelist',
			'doc-part',
			'doc-preface',
			'doc-prologue',
			'doc-pullquote',
			'doc-qna',
			'doc-toc',
		],
		shadowRoot: true,
	},
	select: {
		variant: {
			combobox: {
				matches: {
					attributes: {
						multiple: null,
						size: [null, '1'],
					},
				},
				allowedRoles: ['menu'],
			},
			default: {
				allowedRoles: false,
			},
		},
		contentTypes: ['interactive', 'phrasing', 'flow'],
		implicitAttrs: {
			'aria-valuenow': '',
		},
		// 5.7 Other form elements
		namingMethods: ['labelText'],
	},
	slot: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: false,
		noAriaAttrs: true,
	},
	small: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	source: {
		allowedRoles: false,
		noAriaAttrs: true,
	},
	span: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
		shadowRoot: true,
	},
	strong: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	style: {
		allowedRoles: false,
		noAriaAttrs: true,
	},
	svg: {
		contentTypes: ['embedded', 'phrasing', 'flow'],
		allowedRoles: true,
		chromiumRole: 'SVGRoot',
		namingMethods: ['svgTitleText'],
	},
	sub: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	summary: {
		allowedRoles: false,
		// 5.8 summary Element
		namingMethods: ['subtreeText'],
	},
	sup: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	table: {
		contentTypes: ['flow'],
		allowedRoles: true,
		// 5.11 table Element
		namingMethods: ['tableCaptionText', 'tableSummaryText'],
	},
	tbody: {
		allowedRoles: true,
	},
	template: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: false,
		noAriaAttrs: true,
	},
	textarea: {
		contentTypes: ['interactive', 'phrasing', 'flow'],
		allowedRoles: false,
		implicitAttrs: {
			'aria-valuenow': '',
			'aria-multiline': 'true',
		},
		// 5.1 textarea
		namingMethods: ['labelText', 'placeholderText'],
	},
	tfoot: {
		allowedRoles: true,
	},
	thead: {
		allowedRoles: true,
	},
	time: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	title: {
		allowedRoles: false,
		noAriaAttrs: true,
	},
	td: {
		allowedRoles: true,
	},
	th: {
		allowedRoles: true,
	},
	tr: {
		allowedRoles: true,
	},
	track: {
		allowedRoles: false,
		noAriaAttrs: true,
	},
	u: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	ul: {
		contentTypes: ['flow'],
		allowedRoles: [
			'directory',
			'group',
			'listbox',
			'menu',
			'menubar',
			'none',
			'presentation',
			'radiogroup',
			'tablist',
			'toolbar',
			'tree',
		],
	},
	var: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: true,
	},
	video: {
		variant: {
			controls: {
				matches: '[controls]',
				contentTypes: ['interactive', 'embedded', 'phrasing', 'flow'],
			},
			default: {
				contentTypes: ['embedded', 'phrasing', 'flow'],
			},
		},
		allowedRoles: ['application'],
		chromiumRole: 'video',
	},
	wbr: {
		contentTypes: ['phrasing', 'flow'],
		allowedRoles: ['presentation', 'none'],
	},
};

function isValidRoleAttribute(
	role: RoleMeta,
	name: AriaAttributeName,
): boolean {
	const superClass = role.superclassRole?.find(r =>
		isValidRoleAttribute(ariaRoles[r], name),
	);
	return !!(
		superClass ||
		role.allowedAttrs?.includes(name) ||
		role.requiredAttrs?.includes(name)
	);
}

function findNodeText(node: Node): string | undefined {
	if (node.textContent) return node.textContent;
	if (node instanceof Element)
		for (const child of node.children) {
			if (child instanceof HTMLSlotElement) {
				const slotted = child.assignedNodes({ flatten: true });
				for (const item of slotted) {
					const slotText = findNodeText(item);
					if (slotText) return slotText;
				}
			} else if (node.shadowRoot) {
				for (const item of node.shadowRoot.childNodes) {
					const slotText = findNodeText(item);
					if (slotText) return slotText;
				}
			}
		}
}

function getNodeLabel(node: Element, role?: RoleMeta) {
	const attrValue =
		node.ariaLabel ||
		node.getAttribute('alt') ||
		node.getAttribute('title') ||
		node.getAttribute('aria-labelledby');
	if (attrValue) return attrValue;

	if (role?.nameFromContent) return node.textContent || findNodeText(node);

	return '';
}

export function testAccessibility(
	node: Element,
	root: Element | ShadowRoot = node,
	result: Result[] = [],
) {
	const roleName = node.getAttribute('role') as RoleName | null;
	const role: RoleMeta | null = roleName && ariaRoles[roleName];

	function ok(success: boolean, message: string) {
		result.push({
			success,
			message,
			failureMessage: `Node: ${node.outerHTML}`,
		});
	}

	function testAriaRole() {
		if (!roleName) return;
		ok(!!role, `Role name must be valid`);
		if (!role) return;

		ok(role.type !== 'abstract', 'Abstract roles cannot be used');

		if (role.accessibleNameRequired) {
			const label =
				node.getAttribute('alt') === ''
					? true
					: getNodeLabel(node, role);
			ok(!!label, 'Element must have an accessible name or label');
		}

		if (role.requiredAttrs)
			for (const attr of role.requiredAttrs)
				ok(
					node.hasAttribute(attr),
					`Element must have required attribute "${attr}"`,
				);
	}

	function testAriaAttributes() {
		let notGlobalCount = 0;

		const isNative = node.tagName.toLowerCase() in htmlElms;

		function validateAriaAttribute(name: AriaAttributeName, value: string) {
			const attr = ariaAttrs[name] as AttributeMeta | undefined;

			ok(!!attr, `"${name}" must be a valid aria attribute`);
			if (!attr) return;

			if (attr.values)
				ok(
					attr.values.includes(value),
					`"${value}" must be a valid attribute value for "${name}"`,
				);

			if (role) {
				ok(
					attr.global || isValidRoleAttribute(role, name),
					`Element role must support attribute "${name}"`,
				);
			}

			if (!attr.global) notGlobalCount++;
		}

		for (const { name, value } of node.attributes) {
			if (name.startsWith('aria-')) {
				validateAriaAttribute(name as AriaAttributeName, value);
			}
		}
		if (!isNative && notGlobalCount)
			ok(
				!!role,
				`Custom elements must have a role set if they use aria attributes`,
			);
	}

	testAriaRole();
	testAriaAttributes();

	if (!role?.childrenPresentational) {
		for (const child of node.children)
			testAccessibility(child, root, result);
		if (node.shadowRoot)
			for (const child of node.shadowRoot.children)
				testAccessibility(child, node.shadowRoot, result);
		/*await Promise.all(
			Array.from(node.children).map(child => this.a11y(child))
		);*/
	}

	return result;
}
