export let rules: {
    'require-span-for-public': {
        meta: {
            type: string;
            docs: {
                description: string;
                category: string;
                recommended: boolean;
                url: string;
            };
            fixable: string;
            messages: {
                noSpan: string;
                missingInstrumentation: string;
            };
        };
        create(context: any): {
            ExportNamedDeclaration(node: any): void;
        };
    };
};
//# sourceMappingURL=eslint-plugin.d.ts.map